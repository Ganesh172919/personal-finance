import { describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  computeBackoffMs,
  createConnectTimeoutAgents,
  isRetryableAiCoreError,
  parseRetryAfterMs,
  shedRetryAfterMs,
} from "../services/aiCoreResilience";

const makeBreaker = () => {
  let now = 1_000;
  const changes: string[] = [];
  const breaker = new CircuitBreaker(
    () => ({ failureThreshold: 3, openMs: 30_000 }),
    () => now,
    (snapshot) => changes.push(snapshot.state),
  );
  return { breaker, changes, advance: (ms: number) => (now += ms) };
};

describe("CircuitBreaker", () => {
  it("opens after the failure threshold and refuses requests while open", () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 2; i += 1) {
      expect(breaker.allowRequest()).toBe(true);
      breaker.onFailure();
    }
    expect(breaker.state).toBe("closed");

    breaker.onFailure();
    expect(breaker.state).toBe("open");
    expect(breaker.allowRequest()).toBe(false);
  });

  it("goes open -> half_open -> closed when the single probe succeeds", () => {
    const { breaker, advance, changes } = makeBreaker();
    for (let i = 0; i < 3; i += 1) breaker.onFailure();
    expect(breaker.state).toBe("open");

    advance(30_000);
    expect(breaker.state).toBe("half_open");
    expect(breaker.allowRequest()).toBe(true); // the probe
    expect(breaker.allowRequest()).toBe(false); // everyone else waits for the probe

    breaker.onSuccess();
    expect(breaker.state).toBe("closed");
    expect(breaker.allowRequest()).toBe(true);
    expect(breaker.snapshot().consecutiveFailures).toBe(0);
    expect(changes).toContain("half_open");
    expect(changes[changes.length - 1]).toBe("closed");
  });

  it("re-opens immediately when the half-open probe fails", () => {
    const { breaker, advance } = makeBreaker();
    for (let i = 0; i < 3; i += 1) breaker.onFailure();
    advance(30_000);
    expect(breaker.allowRequest()).toBe(true);

    breaker.onFailure();
    expect(breaker.state).toBe("open");
    expect(breaker.allowRequest()).toBe(false);
    advance(30_000);
    expect(breaker.state).toBe("half_open");
  });

  it("a neutral outcome frees the probe slot without closing or opening", () => {
    const { breaker, advance } = makeBreaker();
    for (let i = 0; i < 3; i += 1) breaker.onFailure();
    advance(30_000);
    expect(breaker.allowRequest()).toBe(true);
    breaker.onNeutral();
    expect(breaker.state).toBe("half_open");
    expect(breaker.allowRequest()).toBe(true);
  });

  it("treats a probe that never reports as lost after the open window", () => {
    const { breaker, advance } = makeBreaker();
    for (let i = 0; i < 3; i += 1) breaker.onFailure();
    advance(30_000);
    expect(breaker.allowRequest()).toBe(true);
    expect(breaker.allowRequest()).toBe(false);
    advance(30_000);
    expect(breaker.allowRequest()).toBe(true);
  });

  it("a success in the closed state resets the failure streak", () => {
    const { breaker } = makeBreaker();
    breaker.onFailure();
    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.state).toBe("closed");
  });
});

describe("retry helpers", () => {
  it("computeBackoffMs grows exponentially with jitter inside [ceiling/2, ceiling]", () => {
    expect(computeBackoffMs(1, 200, () => 0)).toBe(100);
    expect(computeBackoffMs(1, 200, () => 1)).toBe(200);
    expect(computeBackoffMs(2, 200, () => 0)).toBe(200);
    expect(computeBackoffMs(3, 200, () => 1)).toBe(800);
    const samples = new Set(Array.from({ length: 20 }, () => computeBackoffMs(2, 200)));
    expect(samples.size).toBeGreaterThan(1);
  });

  it("parseRetryAfterMs handles seconds, HTTP dates and garbage", () => {
    expect(parseRetryAfterMs("3")).toBe(3000);
    expect(parseRetryAfterMs(["2"])).toBe(2000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:10 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT"))).toBe(10_000);
    expect(parseRetryAfterMs("soon")).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
  });

  it("only a 503 carrying Retry-After counts as an AI Core shed", () => {
    expect(shedRetryAfterMs({ response: { status: 503, headers: { "retry-after": "2" } } })).toBe(2000);
    expect(shedRetryAfterMs({ response: { status: 503, headers: {} } })).toBeUndefined();
    expect(shedRetryAfterMs({ response: { status: 429, headers: { "retry-after": "2" } } })).toBeUndefined();
  });

  it("retries connect failures and 502/503/504 but not read timeouts, 4xx or 500", () => {
    expect(isRetryableAiCoreError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isRetryableAiCoreError({ code: "ECONNTIMEDOUT" })).toBe(true);
    expect(isRetryableAiCoreError({ response: { status: 502 } })).toBe(true);
    expect(isRetryableAiCoreError({ response: { status: 503 } })).toBe(true);
    expect(isRetryableAiCoreError({ code: "ECONNABORTED" })).toBe(false); // axios read timeout
    expect(isRetryableAiCoreError({ response: { status: 400 } })).toBe(false);
    expect(isRetryableAiCoreError({ response: { status: 500 } })).toBe(false);
  });
});

describe("connect timeout agents", () => {
  it("destroys a socket that does not connect within the timeout", async () => {
    vi.useFakeTimers();
    try {
      const { httpAgent } = createConnectTimeoutAgents(50);
      // 192.0.2.0/24 is TEST-NET-1: never answers, so the socket stays "connecting".
      const socket = (httpAgent as unknown as { createConnection: (o: unknown) => import("node:net").Socket }).createConnection({
        host: "192.0.2.1",
        port: 9,
      });
      const failed = new Promise<NodeJS.ErrnoException>((resolve) => socket.once("error", resolve));
      await vi.advanceTimersByTimeAsync(60);
      const error = await failed;
      expect(error.code).toBe("ECONNTIMEDOUT");
      httpAgent.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
