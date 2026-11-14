import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env", () => ({
  getEnv: () => ({ AI_CORE_MAX_CONCURRENCY: 8, AI_CORE_MAX_CONCURRENCY_PER_USER: 2 }),
}));

import { acquireAiCoreSlot } from "../services/aiConcurrency";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe("acquireAiCoreSlot", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("holds the per-user slot until released", async () => {
    const userId = "slot-user-1";
    const first = await acquireAiCoreSlot({ userId });
    const second = await acquireAiCoreSlot({ userId });

    // Per-user concurrency is 2, so a third acquire must wait.
    let thirdAcquired = false;
    const thirdPromise = acquireAiCoreSlot({ userId }).then((release) => {
      thirdAcquired = true;
      return release;
    });

    await tick();
    expect(thirdAcquired).toBe(false);

    first();
    await tick();
    expect(thirdAcquired).toBe(true);

    second();
    (await thirdPromise)();
  });

  it("release is idempotent and does not free more than one slot", async () => {
    const userId = "slot-user-2";
    const a = await acquireAiCoreSlot({ userId });
    const b = await acquireAiCoreSlot({ userId });

    a();
    a();
    a(); // repeated releases of the same slot must not open extra capacity

    const acquired: string[] = [];
    const c = acquireAiCoreSlot({ userId }).then((release) => {
      acquired.push("c");
      return release;
    });
    const d = acquireAiCoreSlot({ userId }).then((release) => {
      acquired.push("d");
      return release;
    });

    await tick();
    // b still holds one slot and c took a's; d must still be waiting.
    expect(acquired).toEqual(["c"]);

    b();
    await tick();
    expect(acquired).toEqual(["c", "d"]);

    (await c)();
    (await d)();
  });

  it("does not let one user's streams block another user", async () => {
    const heldA1 = await acquireAiCoreSlot({ userId: "slot-user-a" });
    const heldA2 = await acquireAiCoreSlot({ userId: "slot-user-a" });

    const other = await Promise.race([
      acquireAiCoreSlot({ userId: "slot-user-b" }).then((release) => ({ release })),
      tick(50).then(() => null),
    ]);
    expect(other).not.toBeNull();

    heldA1();
    heldA2();
    other?.release();
  });
});
