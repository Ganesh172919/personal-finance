import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiCoreProcessRequest } from "../services/aiCoreClient";

const mocks = vi.hoisted(() => ({
  ttl: 120_000, stored: new Map<string, any>(), findOne: vi.fn(), updateOne: vi.fn(),
}));
vi.mock("../config/env", () => ({ getEnv: () => ({ CONVERSATION_INSIGHTS_CACHE_TTL_MS: mocks.ttl }) }));
vi.mock("../config/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../models/aiResponseCacheModel", () => ({ default: {
  findOne: mocks.findOne, updateOne: mocks.updateOne,
} }));
import { conversationInsightsCacheKey, getOrGenerateConversationInsights } from "../services/conversationInsightsCache";

const orgId = new Types.ObjectId();
const userId = new Types.ObjectId();
const request: AiCoreProcessRequest = {
  org_id: String(orgId), user_id: String(userId), user_input: "Conversation summary",
  user_profile: { income: 7500 },
  finance_context: { as_of: "2026-10-30T08:00:00Z", tasks: [{ title: "Review" }] },
};
const generate = vi.fn();
const run = (overrides: Partial<Parameters<typeof getOrGenerateConversationInsights>[0]> = {}) =>
  getOrGenerateConversationInsights({ orgId, userId, request, generate, ...overrides });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  vi.clearAllMocks();
  mocks.ttl = 120_000;
  mocks.stored.clear();
  generate.mockReset().mockResolvedValue({ response: "Current summary", fallback_used: false });
  mocks.findOne.mockImplementation(query => ({ lean: async () => {
    const row = mocks.stored.get(query.cacheKey);
    return row && String(row.orgId) === String(query.orgId) && String(row.userId) === String(query.userId)
      && row.expiresAt > query.expiresAt.$gt ? structuredClone(row) : null;
  } }));
  mocks.updateOne.mockImplementation(async (scope, update) => {
    mocks.stored.set(scope.cacheKey, {
      ...scope, orgId: String(scope.orgId), userId: String(scope.userId),
      responseData: structuredClone(update.$set.responseData), expiresAt: update.$set.expiresAt,
    });
  });
});
afterEach(() => vi.useRealTimers());

describe("conversation insight result reuse", () => {
  it("reuses unchanged context despite key order and request timestamps", async () => {
    const first = await run();
    const next = { ...request, user_profile: { income: 7500 }, finance_context: {
      tasks: [{ title: "Review" }], as_of: "2026-10-30T08:01:00Z",
    } };
    const second = await run({ request: next });
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { user_input: "Changed conversation summary" },
    { user_profile: { income: 7500.25 } },
    { finance_context: { ...request.finance_context, tasks: [] } },
    { finance_context: { ...request.finance_context, goals: [{ current: 25.25 }] } },
    { finance_context: { ...request.finance_context, memory: [{ key: "priority", value: "debt" }] } },
    { finance_context: { ...request.finance_context, files: [{ id: "new-file" }] } },
    { finance_context: { ...request.finance_context, as_of: "2026-10-31T00:00:00Z" } },
  ])("regenerates when relevant context changes: %j", async change => {
    await run();
    expect((await run({ request: { ...request, ...change } })).cacheHit).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("separates users and workspaces in both key and database scope", async () => {
    await run();
    await run({ userId: new Types.ObjectId() });
    await run({ orgId: new Types.ObjectId() });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(mocks.findOne.mock.calls[0][0]).toMatchObject({ orgId, userId, endpoint: "conversation-insights" });
  });

  it("enforces expiry before MongoDB's TTL cleanup", async () => {
    await run();
    vi.setSystemTime(new Date("2026-10-30T08:02:01Z"));
    expect((await run()).cacheHit).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("explicit Refresh bypasses a valid snapshot", async () => {
    await run();
    generate.mockResolvedValueOnce({ response: "Fresh summary" });
    expect((await run({ refresh: true })).data.response).toBe("Fresh summary");
    expect((await run()).data.response).toBe("Fresh summary");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("limits degraded replies to fifteen seconds", async () => {
    generate.mockResolvedValue({ response: "Degraded summary", fallback_used: true });
    await run();
    vi.setSystemTime(new Date("2026-10-30T08:00:16Z"));
    expect((await run()).cacheHit).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for the same owned context", async () => {
    let release!: (data: Record<string, unknown>) => void;
    generate.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = run();
    const second = run();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    release({ response: "Shared computation" });
    const results = await Promise.all([first, second]);
    expect(results.filter(result => result.cacheHit)).toHaveLength(1);
  });

  it("does not cache a failed computation or leave it in flight", async () => {
    generate.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(run()).rejects.toThrow("Provider unavailable");
    expect(mocks.stored.size).toBe(0);
    expect((await run()).cacheHit).toBe(false);
  });

  it("cache storage failures do not fail a successful AI response", async () => {
    mocks.findOne.mockImplementationOnce(() => ({ lean: async () => { throw new Error("read failed"); } }));
    mocks.updateOne.mockRejectedValueOnce(new Error("write failed"));
    expect((await run()).data.response).toBe("Current summary");
  });

  it("can disable caching without bypassing AI execution", async () => {
    mocks.ttl = 0;
    await run(); await run();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(conversationInsightsCacheKey(String(orgId), String(userId), request)).toMatch(/^[a-f0-9]{64}$/);
  });
});
