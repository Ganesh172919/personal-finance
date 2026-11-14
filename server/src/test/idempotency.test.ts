import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { HttpError } from "../middleware/httpError";
import {
  MemoryIdempotencyStore,
  idempotency,
  type IdempotencyRecord,
  type IdempotencyStore,
} from "../middleware/idempotency";

type AppOptions = {
  streaming?: boolean;
  store?: IdempotencyStore;
  handler?: (req: Request, res: Response) => void | Promise<void>;
};

const buildApp = (options: AppOptions = {}) => {
  const store = options.store ?? new MemoryIdempotencyStore();
  const calls = { count: 0 };

  const app = express();
  app.use(express.json());
  // Stand-ins for passport and orgContext: both identities are resolved by the
  // server before idempotency runs, not read from a client header in production.
  app.use((req, _res, next) => {
    const id = req.header("x-test-user");
    if (id) {
      (req as any).user = { _id: { toString: () => id } };
      if (req.header("x-test-org") !== "none") {
        (req as any).org = { orgId: req.header("x-test-org") || "org-a" };
      }
    }
    next();
  });

  app.post(
    "/ai/run",
    idempotency({ streaming: options.streaming, store: () => store }),
    async (req, res) => {
      calls.count += 1;
      if (options.handler) return options.handler(req, res);
      res.status(200).json({ ok: true, n: calls.count, echo: req.body });
    }
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    return res.status(500).json({ code: "INTERNAL", message: String(err) });
  });

  return { app, calls, store };
};

const KEY = "key-0000-aaaa";

describe("idempotency middleware", () => {
  it("is a no-op without an Idempotency-Key header", async () => {
    const { app, calls } = buildApp();
    await request(app).post("/ai/run").set("x-test-user", "u1").send({ q: 1 }).expect(200);
    await request(app).post("/ai/run").set("x-test-user", "u1").send({ q: 1 }).expect(200);
    expect(calls.count).toBe(2);
  });

  it("replays the stored response for a retry with the same key and body", async () => {
    const { app, calls } = buildApp();
    const first = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(first.status).toBe(200);
    expect(first.headers["idempotent-replay"]).toBeUndefined();

    // Let the 'finish' handler persist the response before retrying.
    await new Promise((r) => setTimeout(r, 10));

    const retry = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(retry.status).toBe(200);
    expect(retry.headers["idempotent-replay"]).toBe("true");
    expect(retry.body).toEqual(first.body);
    expect(calls.count).toBe(1); // the billable work ran exactly once
  });

  it("rejects a reused key carrying a different body with 422", async () => {
    const { app, calls } = buildApp();
    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    await new Promise((r) => setTimeout(r, 10));

    const reused = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 2 });
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(calls.count).toBe(1);
  });

  it("runs the work once when duplicates arrive concurrently (second gets 409)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, calls } = buildApp({
      handler: async (_req, res) => {
        await gate;
        res.status(200).json({ ok: true });
      },
    });

    const first = request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 }).then((r) => r);
    await new Promise((r) => setTimeout(r, 20)); // first is now in flight

    const duplicate = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("IDEMPOTENCY_IN_PROGRESS");
    expect(duplicate.headers["retry-after"]).toBe("2");

    release();
    expect((await first).status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("releases the key after a 5xx so the client's retry re-runs the work", async () => {
    let attempt = 0;
    const { app, calls } = buildApp({
      handler: (_req, res) => {
        attempt += 1;
        if (attempt === 1) {
          res.status(503).json({ message: "AI core unavailable" });
          return;
        }
        res.status(200).json({ ok: true, attempt });
      },
    });

    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 }).expect(503);
    await new Promise((r) => setTimeout(r, 10));

    const retry = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(retry.status).toBe(200);
    expect(retry.headers["idempotent-replay"]).toBeUndefined();
    expect(calls.count).toBe(2);
  });

  it("scopes keys per user: the same key from two users runs twice", async () => {
    const { app, calls } = buildApp();
    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    await request(app).post("/ai/run").set("x-test-user", "u2").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    expect(calls.count).toBe(2);
  });

  it("does not replay a financial response across organizations for the same user and key", async () => {
    const { app, calls } = buildApp({
      handler: (req, res) => {
        res.json({ org: req.org?.orgId, privateBalance: req.org?.orgId === "org-a" ? 100 : 500 });
      },
    });

    const first = await request(app).post("/ai/run")
      .set("x-test-user", "u1").set("x-test-org", "org-a")
      .set("Idempotency-Key", KEY).send({ q: "my finances" }).expect(200);
    expect(first.body).toEqual({ org: "org-a", privateBalance: 100 });

    const second = await request(app).post("/ai/run")
      .set("x-test-user", "u1").set("x-test-org", "org-b")
      .set("Idempotency-Key", KEY).send({ q: "my finances" }).expect(200);
    expect(second.headers["idempotent-replay"]).toBeUndefined();
    expect(second.body).toEqual({ org: "org-b", privateBalance: 500 });
    expect(calls.count).toBe(2);

    const retry = await request(app).post("/ai/run")
      .set("x-test-user", "u1").set("x-test-org", "org-b")
      .set("Idempotency-Key", KEY).send({ q: "my finances" }).expect(200);
    expect(retry.headers["idempotent-replay"]).toBe("true");
    expect(retry.body).toEqual(second.body);
    expect(calls.count).toBe(2);
  });

  it("does not replay a cached response when tenant resolution fails", async () => {
    const { app, calls } = buildApp();
    await request(app).post("/ai/run").set("x-test-user", "u1")
      .set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    const missing = await request(app).post("/ai/run").set("x-test-user", "u1")
      .set("x-test-org", "none").set("Idempotency-Key", KEY).send({ q: 1 }).expect(403);
    expect(missing.body.code).toBe("ORG_CONTEXT_REQUIRED");
    expect(calls.count).toBe(1);
  });

  it("rejects malformed keys with 400", async () => {
    const { app, calls } = buildApp();
    for (const bad of ["short", "has spaces in it!", "x".repeat(129)]) {
      const res = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", bad).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("IDEMPOTENCY_KEY_INVALID");
    }
    expect(calls.count).toBe(0);
  });

  it("ignores the header for unauthenticated requests", async () => {
    const { app, calls } = buildApp();
    await request(app).post("/ai/run").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    await request(app).post("/ai/run").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    expect(calls.count).toBe(2);
  });

  it("refuses a duplicate key on streaming routes instead of replaying", async () => {
    const { app, calls } = buildApp({
      streaming: true,
      handler: (_req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.write("data: [DONE]\n\n");
        res.end();
      },
    });

    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 }).expect(200);
    await new Promise((r) => setTimeout(r, 10));

    const dup = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("IDEMPOTENCY_KEY_USED");
    expect(calls.count).toBe(1);
  });

  it("fails open when the store is unavailable", async () => {
    const brokenStore: IdempotencyStore = {
      claim: vi.fn().mockRejectedValue(new Error("redis down")),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
    const { app, calls } = buildApp({ store: brokenStore });

    const res = await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({ q: 1 });
    expect(res.status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("does not store responses larger than the replay cap, so a retry re-runs instead of replaying garbage", async () => {
    const { app, calls, store } = buildApp({
      handler: (_req, res) => {
        res.status(200).json({ blob: "x".repeat(300 * 1024) });
      },
    });

    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({}).expect(200);
    await new Promise((r) => setTimeout(r, 10));

    expect((store as MemoryIdempotencyStore).size).toBe(0);
    await request(app).post("/ai/run").set("x-test-user", "u1").set("Idempotency-Key", KEY).send({}).expect(200);
    expect(calls.count).toBe(2);
  });
});

describe("MemoryIdempotencyStore", () => {
  const record: IdempotencyRecord = { state: "in_progress", fingerprint: "f" };

  it("claims atomically and honours TTL", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryIdempotencyStore();
      expect(await store.claim("k", record, 1)).toBe(true);
      expect(await store.claim("k", record, 1)).toBe(false);

      vi.advanceTimersByTime(1500);
      expect(await store.get("k")).toBeNull();
      expect(await store.claim("k", record, 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
