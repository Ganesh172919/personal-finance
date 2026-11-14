import express from "express";
import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { rateLimit } from "express-rate-limit";
import RedisMock from "ioredis-mock";
import { afterEach, describe, expect, it } from "vitest";
import { createRateLimitStore, ResilientRateLimitStore } from "../config/rateLimitStore";

const servers: http.Server[] = [];
const clients: Array<{ disconnect: () => void }> = [];

/**
 * ioredis-mock has no `call`/SCRIPT/EVALSHA, which rate-limit-redis relies on. This shim maps them onto
 * EVAL so the real RedisStore Lua scripts run against the mock; clients on the same host share data.
 */
const newClient = (host = "rl-shared") => {
  const mock = new RedisMock({ host, port: 6379 }) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  clients.push(mock as never);
  const scripts = new Map<string, string>();
  return {
    call: async (command: string, ...args: unknown[]) => {
      const name = command.toUpperCase();
      if (name === "SCRIPT") {
        const sha = createHash("sha1").update(String(args[1])).digest("hex");
        scripts.set(sha, String(args[1]));
        return sha;
      }
      if (name === "EVALSHA") return mock.eval!(scripts.get(String(args[0]))!, ...args.slice(1));
      return mock[command.toLowerCase()]!(...args);
    },
  } as never;
};

/** One "replica": its own limiter instance + express app, counting on the given store. */
const startReplica = async (store: ReturnType<typeof createRateLimitStore>, limit = 3) => {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      store,
      validate: false,
      keyGenerator: () => "same-client",
    }),
  );
  app.get("/", (_req, res) => void res.json({ ok: true }));
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
  for (const c of clients.splice(0)) c.disconnect();
});

describe("shared rate-limit store", () => {
  it("counts across two limiter instances (replicas) that share one Redis", async () => {
    const urlA = await startReplica(createRateLimitStore("rl:test-a:", { client: newClient() }), 3);
    const urlB = await startReplica(createRateLimitStore("rl:test-a:", { client: newClient() }), 3);

    const statuses: number[] = [];
    for (const url of [urlA, urlB, urlA, urlB, urlA]) statuses.push((await fetch(url)).status);

    // Limit is 3 in total, not 3 per replica.
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("keeps separate counters per prefix", async () => {
    const url1 = await startReplica(createRateLimitStore("rl:test-p1:", { client: newClient() }), 1);
    const url2 = await startReplica(createRateLimitStore("rl:test-p2:", { client: newClient() }), 1);
    expect((await fetch(url1)).status).toBe(200);
    expect((await fetch(url2)).status).toBe(200);
    expect((await fetch(url1)).status).toBe(429);
  });

  it("returns undefined (default in-memory store) when Redis is not configured", () => {
    expect(createRateLimitStore("rl:none:", { client: null })).toBeUndefined();
  });

  it("falls back to a local counter when Redis fails, then recovers", async () => {
    let now = 1_000;
    let healthy = true;
    const shared = {
      prefix: "rl:fb:",
      init: () => undefined,
      get: async () => undefined,
      increment: async () => {
        if (!healthy) throw new Error("redis down");
        return { totalHits: 42, resetTime: new Date(now + 60_000) };
      },
      decrement: async () => undefined,
      resetKey: async () => undefined,
    };
    const store = new ResilientRateLimitStore(shared, { name: "fb", cooldownMs: 10_000, commandTimeoutMs: 100, now: () => now });
    store.init({ windowMs: 60_000 } as never);

    expect((await store.increment("k")).totalHits).toBe(42);
    expect(store.isDegraded).toBe(false);

    healthy = false;
    const first = await store.increment("k"); // fails -> local
    expect(first.totalHits).toBe(1);
    expect(store.isDegraded).toBe(true);
    expect((await store.increment("k")).totalHits).toBe(2); // within cooldown -> stays local, no Redis call

    healthy = true;
    now += 10_001; // cooldown elapsed -> probe Redis again
    expect((await store.increment("k")).totalHits).toBe(42);
    expect(store.isDegraded).toBe(false);
  });

  it("falls back when a Redis command is slower than the timeout", async () => {
    const shared = {
      prefix: "rl:slow:",
      init: () => undefined,
      increment: () => new Promise<never>(() => undefined), // never answers
      decrement: async () => undefined,
      resetKey: async () => undefined,
    };
    const store = new ResilientRateLimitStore(shared, { name: "slow", commandTimeoutMs: 20 });
    store.init({ windowMs: 60_000 } as never);
    expect((await store.increment("k")).totalHits).toBe(1);
    expect(store.isDegraded).toBe(true);
  });
});
