import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("axios", () => {
  const instance = { post, get, defaults: { timeout: 0, headers: {} } };
  class AxiosError extends Error {}
  const create = vi.fn(() => instance);
  return { default: { create, isAxiosError: () => false, isCancel: () => false }, create, AxiosError };
});

vi.mock("../services/aiLearningOptOut", () => ({
  LEARNING_OPT_OUT_HEADER: "X-Learning-Opt-Out",
  primeLearningOptOut: async () => undefined,
  isLearningOptOutCached: () => false,
}));

const ENV_KEYS = ["AI_CORE_RETRY_BASE_MS", "AI_CORE_RETRY_MAX", "AI_CORE_CIRCUIT_OPEN_MS", "AI_CORE_RETRY_AFTER_MAX_MS"] as const;
const savedEnv: Record<string, string | undefined> = {};

const httpError = (status: number, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, headers, data: { detail: `HTTP ${status}` } } });
const netError = (code: string) => Object.assign(new Error(code), { code });

const load = async () => {
  vi.resetModules();
  return import("../services/aiCoreClient");
};
const scenarioPayload = { scenario_type: "expense", amount: 10 };
const processPayload = { user_input: "hello", user_profile: null };

describe("AI Core client retries and shedding", () => {
  beforeAll(async () => {
    await load(); // warm the module graph so the first test is not charged for the cold import
  }, 90_000);

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.AI_CORE_RETRY_BASE_MS = "1";
    post.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: { status: "healthy" } });
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("retries an idempotent call once on a connect failure and returns the real result", async () => {
    const { processAiCoreScenario } = await load();
    post.mockRejectedValueOnce(netError("ECONNREFUSED")).mockResolvedValueOnce({ data: { delta: { ok: true }, fallback_used: false } });

    const result = await processAiCoreScenario(scenarioPayload, "req-1");
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.fallback_used).toBe(false);
  });

  it("does not retry a read timeout (work may still be running upstream)", async () => {
    const { processAiCoreScenario } = await load();
    post.mockRejectedValue(netError("ECONNABORTED"));

    const result = await processAiCoreScenario(scenarioPayload, "req-2");
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.fallback_used).toBe(true);
  });

  it("never retries a non-idempotent call on a transient error", async () => {
    const { processAiCoreRequest } = await load();
    post.mockRejectedValue(httpError(502));

    const result = await processAiCoreRequest(processPayload, "req-3");
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.fallback_used).toBe(true);
  });

  it("honours AI Core 503 + Retry-After by retrying once, even for non-idempotent work", async () => {
    const { processAiCoreRequest } = await load();
    post
      .mockRejectedValueOnce(httpError(503, { "retry-after": "0" }))
      .mockResolvedValueOnce({ data: { success: true, final_output: "done", agent: "master" } });

    const result = await processAiCoreRequest(processPayload, "req-4");
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.final_output).toBe("done");
    expect(result.fallback_used).toBe(false);
  });

  it("surfaces 503 + Retry-After (not a fallback payload) when AI Core sheds twice, and leaves the breaker closed", async () => {
    const { processAiCoreRequest, getAiCoreClientStatus } = await load();
    post.mockRejectedValue(httpError(503, { "retry-after": "0" }));

    for (let i = 0; i < 4; i += 1) {
      const error = await processAiCoreRequest(processPayload, `req-5-${i}`).catch((e) => e);
      expect(error).toMatchObject({ statusCode: 503, code: "AI_CORE_OVERLOADED" });
      expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
    expect(post).toHaveBeenCalledTimes(8); // 4 calls x (attempt + one Retry-After retry)
    expect(getAiCoreClientStatus().circuitState).toBe("closed"); // overload is not an outage
  });

  it("walks the breaker closed -> open -> half_open -> closed", async () => {
    process.env.AI_CORE_CIRCUIT_OPEN_MS = "60";
    process.env.AI_CORE_RETRY_MAX = "0";
    const { processAiCoreScenario, getAiCoreClientStatus } = await load();
    post.mockRejectedValue(httpError(500));

    expect(getAiCoreClientStatus().circuitState).toBe("closed");
    for (let i = 0; i < 3; i += 1) await processAiCoreScenario(scenarioPayload, `req-6-${i}`);
    expect(getAiCoreClientStatus().circuitState).toBe("open");

    // Open: short-circuits without touching AI Core.
    post.mockClear();
    const blocked = await processAiCoreScenario(scenarioPayload, "req-6-blocked");
    expect(blocked.fallback_used).toBe(true);
    expect(post).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(getAiCoreClientStatus().circuitState).toBe("half_open");

    post.mockResolvedValue({ data: { fallback_used: false } });
    const probe = await processAiCoreScenario(scenarioPayload, "req-6-probe");
    expect(probe.fallback_used).toBe(false);
    expect(getAiCoreClientStatus().circuitState).toBe("closed");
  });
});
