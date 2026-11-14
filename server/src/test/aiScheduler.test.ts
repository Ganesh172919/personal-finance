import { describe, expect, it } from "vitest";
import { AiCapacityError, AiScheduler, type AiLimits } from "../services/aiConcurrency";

const limits = (overrides: Partial<AiLimits> = {}): AiLimits => ({
  maxConcurrency: 1,
  maxPerUser: 10,
  queueMax: 3,
  queueMaxPerUser: 10,
  maxWaitMs: 5_000,
  ...overrides,
});

const settle = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok" as const,
    (error: unknown) => error,
  );
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("AiScheduler admission control", () => {
  it("serves queued work by lane priority (chat > autopilot > batch), FIFO within a lane", async () => {
    const scheduler = new AiScheduler(() => limits({ queueMax: 10 }));
    const holder = await scheduler.acquire({ userId: "u0" });

    const order: string[] = [];
    const waiters = [
      scheduler.acquire({ userId: "u1", priority: "batch" }).then((release) => {
        order.push("batch");
        release();
      }),
      scheduler.acquire({ userId: "u2", priority: "autopilot" }).then((release) => {
        order.push("autopilot");
        release();
      }),
      scheduler.acquire({ userId: "u3", priority: "chat" }).then((release) => {
        order.push("chat-1");
        release();
      }),
      scheduler.acquire({ userId: "u4", priority: "chat" }).then((release) => {
        order.push("chat-2");
        release();
      }),
    ];
    await tick();
    expect(scheduler.stats.queuedByLane).toEqual({ chat: 2, autopilot: 1, batch: 1 });

    holder();
    await Promise.all(waiters);
    expect(order).toEqual(["chat-1", "chat-2", "autopilot", "batch"]);
    expect(scheduler.stats.inFlight).toBe(0);
    expect(scheduler.stats.queued).toBe(0);
  });

  it("sheds with 503 + retryAfterSeconds when the queue is full", async () => {
    const scheduler = new AiScheduler(() => limits({ queueMax: 2 }));
    const holder = await scheduler.acquire({ userId: "u0" });
    const queued = [scheduler.acquire({ userId: "u1" }), scheduler.acquire({ userId: "u2" })];
    queued.forEach((p) => p.catch(() => undefined));

    const result = await settle(scheduler.acquire({ userId: "u3" }));
    expect(result).toBeInstanceOf(AiCapacityError);
    const error = result as AiCapacityError;
    expect(error.statusCode).toBe(503);
    expect(error.reason).toBe("queue_full");
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    holder();
    for (const p of queued) (await p)();
  });

  it("evicts the newest lower-priority waiter when a higher-priority request arrives at a full queue", async () => {
    const scheduler = new AiScheduler(() => limits({ queueMax: 2 }));
    const holder = await scheduler.acquire({ userId: "u0" });
    const batchOld = scheduler.acquire({ userId: "b1", priority: "batch" });
    const batchNew = scheduler.acquire({ userId: "b2", priority: "batch" });
    const batchOldResult = settle(batchOld);
    const batchNewResult = settle(batchNew);

    const chat = scheduler.acquire({ userId: "c1", priority: "chat" });
    const evicted = await batchNewResult;
    expect(evicted).toBeInstanceOf(AiCapacityError);
    expect((evicted as AiCapacityError).reason).toBe("evicted");

    // A batch request can never evict chat work.
    const shed = await settle(scheduler.acquire({ userId: "b3", priority: "batch" }));
    expect((shed as AiCapacityError).reason).toBe("queue_full");

    holder();
    (await chat)();
    expect(await batchOldResult).toBe("ok");
  });

  it("sheds a flooding user with 429 before they fill the shared queue", async () => {
    const scheduler = new AiScheduler(() => limits({ queueMax: 10, queueMaxPerUser: 2 }));
    const holder = await scheduler.acquire({ userId: "flooder" });
    const queued = [scheduler.acquire({ userId: "flooder" }), scheduler.acquire({ userId: "flooder" })];

    const result = (await settle(scheduler.acquire({ userId: "flooder" }))) as AiCapacityError;
    expect(result.statusCode).toBe(429);
    expect(result.reason).toBe("user_queue_full");

    // Another user still queues fine.
    const other = scheduler.acquire({ userId: "other" });
    await tick();
    expect(scheduler.stats.queued).toBe(3);

    holder();
    for (const p of [...queued, other]) (await p)();
  });

  it("sheds a request that waits longer than the max wait", async () => {
    const scheduler = new AiScheduler(() => limits({ maxWaitMs: 20 }));
    const holder = await scheduler.acquire({ userId: "u0" });

    const result = (await settle(scheduler.acquire({ userId: "u1" }))) as AiCapacityError;
    expect(result).toBeInstanceOf(AiCapacityError);
    expect(result.reason).toBe("queue_timeout");
    expect(result.statusCode).toBe(503);
    expect(scheduler.stats.queued).toBe(0);

    holder();
  });

  it("removes an aborted waiter from the queue", async () => {
    const scheduler = new AiScheduler(() => limits());
    const holder = await scheduler.acquire({ userId: "u0" });
    const controller = new AbortController();
    const pending = settle(scheduler.acquire({ userId: "u1", signal: controller.signal }));
    await tick();
    expect(scheduler.stats.queued).toBe(1);

    controller.abort();
    expect(((await pending) as AiCapacityError).reason).toBe("aborted");
    expect(scheduler.stats.queued).toBe(0);
    holder();
  });

  it("per-user cap does not block other users and release is idempotent", async () => {
    const scheduler = new AiScheduler(() => limits({ maxConcurrency: 4, maxPerUser: 1 }));
    const a1 = await scheduler.acquire({ userId: "a" });
    const a2 = scheduler.acquire({ userId: "a" });
    const b = await scheduler.acquire({ userId: "b" }); // not stuck behind a's queued request
    await tick();
    expect(scheduler.stats.inFlight).toBe(2);
    expect(scheduler.stats.queued).toBe(1);

    a1();
    a1();
    const a2Release = await a2;
    expect(scheduler.stats.inFlight).toBe(2);
    a2Release();
    b();
    expect(scheduler.stats.inFlight).toBe(0);
  });
});
