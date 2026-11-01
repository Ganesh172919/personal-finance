import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), create: vi.fn() }));
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return { ...actual, default: { ...actual.default, create: http.create.mockImplementation(() => http) } };
});

import { processAiCoreRequest } from "../services/aiCoreClient";

describe("AI Core trace metrics contract", () => {
  beforeEach(() => {
    http.get.mockResolvedValue({ data: { status: "ok" } });
  });

  it("preserves an explicit PDF page citation from Python", async () => {
    const citation = { id: "retrieval:qa", type: "retrieval_chunk", label: "loan.pdf · page 4",
      snippet: "Prepayment fee USD 25", entity_id: "507f1f77bcf86cd799439011", page_number: 4 };
    http.post.mockResolvedValueOnce({ data: { success: true, final_output: "Ready", evidence: [citation] } });
    const result = await processAiCoreRequest({ user_input: "Review payment terms", user_profile: null }, "page-citation");
    expect(result.evidence).toEqual([citation]);
  });

  it.each([0, -1, 1.5, true, "4", Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "does not turn an invalid physical page into a citation: %s", async (page_number) => {
      http.post.mockResolvedValueOnce({ data: { success: true, final_output: "Ready",
        evidence: [{ type: "retrieval_chunk", label: "Loan terms", page_number }] } });
      const result = await processAiCoreRequest({ user_input: "Review payment terms", user_profile: null }, "invalid-citation");
      expect(result.evidence?.[0]).not.toHaveProperty("page_number");
    });

  it("preserves Python per-agent metrics in the server response", async () => {
    const trace = {
      agent: "master_synthesis", startedAt: "2026-10-24T00:00:00Z", endedAt: "2026-10-24T00:00:01Z",
      status: "success", phase: "synthesis", latencyMs: 123.5, llmCalls: 1,
      inputTokens: 20, outputTokens: 10, tokenCount: 30, fallbackUsed: true, cacheHit: true,
    };
    http.post.mockResolvedValueOnce({ data: { success: true, final_output: "Ready", workflow_trace: [trace] } });
    const result = await processAiCoreRequest({ user_input: "Budget review", user_profile: null }, "trace-contract");
    expect(result.workflow_trace[0]).toEqual(trace);
  });

  it("accepts old trace entries and rejects invalid numeric metrics", async () => {
    http.post.mockResolvedValueOnce({ data: { success: true, final_output: "Ready", workflow_trace: [{
      agent: "budget_planner", status: "success", latencyMs: -1, llmCalls: Number.POSITIVE_INFINITY,
      inputTokens: "invalid", outputTokens: 5,
    }] } });
    const result = await processAiCoreRequest({ user_input: "Budget review", user_profile: null }, "legacy-trace");
    expect(result.workflow_trace[0]).toMatchObject({
      agent: "budget_planner", latencyMs: 0, llmCalls: 0, inputTokens: 0, outputTokens: 5,
      tokenCount: 0, fallbackUsed: false, cacheHit: false,
    });
  });

  it("authenticates requests when AI Core has internal token protection enabled", async () => {
    const original = process.env.AI_CORE_INTERNAL_TOKEN;
    process.env.AI_CORE_INTERNAL_TOKEN = "test-internal-ai-token";
    try {
      http.post.mockResolvedValueOnce({ data: { success: true, final_output: "Ready", workflow_trace: [] } });
      await processAiCoreRequest({ user_input: "Budget review", user_profile: null }, "protected-request");
      expect(http.create).toHaveBeenLastCalledWith(expect.objectContaining({
        headers: expect.objectContaining({ "X-Internal-Token": "test-internal-ai-token" }),
      }));
    } finally {
      if (original === undefined) delete process.env.AI_CORE_INTERNAL_TOKEN;
      else process.env.AI_CORE_INTERNAL_TOKEN = original;
    }
  });
});
