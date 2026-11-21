import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiCoreClient", async () => {
  const actual = await vi.importActual<typeof import("../services/aiCoreClient")>("../services/aiCoreClient");
  return {
    ...actual,
    processAiCoreRequest: vi.fn(async (_payload: any, requestId: string) => ({
      success: true,
      final_output: "Deterministic assistant response.",
      agent: "master",
      actionType: "review",
      priority: "medium",
      insights: [],
      analysis_type: "comprehensive",
      agents_involved: ["master"],
      detailed_analysis: {},
      evidence: _payload.finance_context?.evidence || [],
      confidence: _payload.finance_context?.confidence,
      suggested_actions: [{ title: "Review the payment clause", why: "Check the original terms", priority: "medium" }],
      linked_entity_ids: { files: _payload.finance_context?.files?.map((file: any) => file.id) || [] },
      workflow_trace: [{
        agent: "budget_planner", startedAt: "2026-10-24T00:00:00Z", endedAt: "2026-10-24T00:00:01Z",
        status: "success", phase: "execution", latencyMs: 12.5, llmCalls: 0,
        inputTokens: 0, outputTokens: 0, tokenCount: 0, fallbackUsed: false, cacheHit: true,
      }],
      fallback_used: false,
      active_provider: "groq",
      active_model: "openai/gpt-oss-20b",
      active_key_id: "internal-key-reference",
      recovered_failures: [{ provider: "gemini", key_id: "internal-key-reference", reason: "access_denied" }],
      llm_call_count: 0,
      request_id: requestId,
      usage: {
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        models: ["gemini-test"],
      },
      plan: {
        executive_summary: "Deterministic plan.",
        key_metrics: {},
        actions: {
          next_7_days: [],
          next_30_days: [],
          next_12_months: [],
        },
        assumptions: [],
        data_warnings: [],
      },
    })),
  };
});

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { processAiCoreRequest } from "../services/aiCoreClient";
import { AiCoreOverloadedError } from "../services/aiCoreResilience";
import AutopilotRunModel from "../models/autopilotRunModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";
import { createTextPdf } from "./pdfTestHelpers";
import { parseChatDocumentRequest } from "../services/chatDocuments";
import * as fileTextExtraction from "../services/fileTextExtraction";
import FinancialProfileModel from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";
import TransactionModel from "../models/transactionModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import UsageEventModel from "../models/usageEventModel";
import { recordFeatureUsage } from "../services/entitlements";
import { Types } from "mongoose";

describe("chat v1 API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let ownerUserId = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    ownerUserId = auth.user._id.toString();

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token || "");
    expect(csrfToken.length).toBeGreaterThan(10);
  });

  it("routes general Bharat Voice questions through AI Core and leaves ledger questions local", async () => {
    const useCore = vi.mocked(processAiCoreRequest);
    useCore.mockClear().mockResolvedValueOnce({
      success: true,
      analysis_type: "financial_education",
      fallback_used: false,
      final_output: "Compound interest includes interest earned in earlier periods.",
      active_model: "gnani/gnani-evon-v3.3-30B-A3B",
      llm_call_count: 1,
    } as Awaited<ReturnType<typeof processAiCoreRequest>>);
    const ask = (query: string) => request(app).post("/api/v1/voice/query")
      .set("Cookie", [cookie, csrfCookie]).set("x-csrf-token", csrfToken)
      .send({ query, language: "en-IN" });

    const education = await ask("How does compound interest work?").expect(200);
    expect(education.body.data).toMatchObject({
      answer: "Compound interest includes interest earned in earlier periods.",
      modelsUsed: { reasoning: "gnani/gnani-evon-v3.3-30B-A3B" },
    });
    expect(useCore).toHaveBeenCalledTimes(1);
    expect(useCore.mock.calls[0]?.[0]).toMatchObject({ user_profile: null, user_id: ownerUserId });
    expect(useCore.mock.calls[0]?.[0]).not.toHaveProperty("finance_context");

    const ledger = await ask("How much did I spend this month?").expect(200);
    expect(ledger.body.data.modelsUsed.reasoning).toBe("Ledger summary");
    expect(useCore).toHaveBeenCalledTimes(1);
  });

  it("disables local demo sign-in by default", async () => {
    await request(app).get("/api/auth/providers").expect(200)
      .expect(response => expect(response.body.demo).toBe(false));
    await request(app).post("/api/auth/demo-evaluator").set("Cookie", csrfCookie)
      .set("x-csrf-token", csrfToken).expect(404);
  });

  it("sends only the explicit public question to web research and rejects file attachments", async () => {
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const ask = (content: string, fileIds: string[] = []) => request(app)
      .post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({ content, fileIds });

    await ask("My private test record is not public.").expect(200);
    const core = vi.mocked(processAiCoreRequest);
    core.mockClear();
    await ask("Search the web for ").expect(400);
    await ask("Search the web for public school events", [new Types.ObjectId().toString()]).expect(400);
    expect(core).not.toHaveBeenCalled();
    core.mockResolvedValueOnce({
      success: true, final_output: "The institute published an event agenda.",
      analysis_type: "public_web_research", agent: "public_web_research", agents_involved: ["public_web_research"],
      detailed_analysis: {}, insights: [], workflow_trace: [], fallback_used: false,
      llm_call_count: 1, request_id: "public-research-test",
      usage: { tokens_in: 120, tokens_out: 38, total_tokens: 158, cost_usd: 0.001, models: ["test-model"] },
    });
    const response = await ask("Search the web for public school events").expect(200);
    expect(core.mock.calls[0]?.[0]).toEqual({
      user_input: "public school events", user_profile: null, user_id: ownerUserId, org_id: expect.any(String),
      options: { conversation_mode: true, public_web_search: true },
    });
    expect(response.body.assistantMessage.metadata.analysisType).toBe("public_web_research");
    expect(response.body.assistantMessage.metadata.cacheHit).toBe(false);
    const tokenUsage = { tokens_in: 120, tokens_out: 38, total_tokens: 158 };
    expect(response.body.assistantMessage.metadata.tokenUsage).toEqual(tokenUsage);
    const history = await request(app).get(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", headers).expect(200);
    expect(history.body.messages.at(-1).metadata.tokenUsage).toEqual(tokenUsage);
  });

  it("answers a current-month spending question from the caller’s ledger without AI Core", async () => {
    vi.mocked(processAiCoreRequest).mockClear();
    const userId = new Types.ObjectId(ownerUserId);
    const { orgId } = await ensurePersonalOrgForUser(userId);
    const other = await createAuthedUser();
    const otherOrg = await ensurePersonalOrgForUser(other.user._id);
    const now = new Date();
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    await TransactionModel.create([
      { orgId, userId, date: now, type: "expense", amount: -5, category: "Food & Dining", description: "Lunch" },
      { orgId, userId, date: now, type: "expense", amount: -2, category: "Transport", description: "Bus" },
      { orgId, userId, date: previousMonth, type: "expense", amount: -100, category: "Transport", description: "Previous month" },
      { orgId: otherOrg.orgId, userId: other.user._id, date: now, type: "expense", amount: -100, category: "Other", description: "Separate workspace" },
    ]);
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const response = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "How much did I spend this month, and which category had the most spending?" }).expect(200);
    expect(response.body.assistantMessage.content).toContain("You spent **$7.00**");
    expect(response.body.assistantMessage.content).toContain("Food & Dining");
    expect(response.body.assistantMessage.metadata.llmCallCount).toBe(0);
    const unitReply = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "How much did I spend this month? Then convert that exact amount to cents and give the result in the second sentence." })
      .expect(200);
    expect(unitReply.body.assistantMessage.content).toMatch(/\*\*\$7\.00\*\*.*\. That is \*\*700 cents\*\*\./);
    expect(unitReply.body.assistantMessage.metadata.llmCallCount).toBe(0);
    const previous = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "What was my total spending last month?" }).expect(200);
    expect(previous.body.assistantMessage.content).toContain("You spent **$100.00**");
    expect(previous.body.assistantMessage.content).toContain("Transport");
    const followUp = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "And this month?" }).expect(200);
    expect(followUp.body.assistantMessage.content).toContain("You spent **$7.00**");
    const chained = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "What about last month?" }).expect(200);
    expect(chained.body.assistantMessage.content).toContain("You spent **$100.00**");
    expect(chained.body.assistantMessage.metadata.llmCallCount).toBe(0);
    expect(processAiCoreRequest).not.toHaveBeenCalled();

    const newer = await request(app).post(url).set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "What is an emergency fund?" }).expect(200);
    expect(newer.body.assistantMessage.metadata.analysisType).not.toBe("monthly_spending");
    vi.mocked(processAiCoreRequest).mockClear();
    const regenerated = await request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "What about last month?", options: { regenerate_of: chained.body.assistantMessage.metadata.agentOutputId, bypass_cache: true } })
      .expect(200);
    expect(regenerated.body.assistantMessage.content).toContain("You spent **$100.00**");
    expect(processAiCoreRequest).not.toHaveBeenCalled();
  });

  it("surfaces AI overload as retryable without storing an orphan question", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    vi.mocked(processAiCoreRequest).mockRejectedValueOnce(new AiCoreOverloadedError(3));
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const response = await request(app).post(url)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "How is my budget?" }).expect(503);
    expect(response.headers["retry-after"]).toBe("3");
    const history = await request(app).get(url).set("Cookie", cookie).expect(200);
    expect(history.body.messages).toHaveLength(0);
  });

  it("does not save or reuse canned advice if conversational inference is unavailable", async () => {
    const core = vi.mocked(processAiCoreRequest);
    core.mockClear().mockResolvedValueOnce({
      success: true, final_output: "Generic advice", analysis_type: "chat_assistant", fallback_used: true,
    } as Awaited<ReturnType<typeof processAiCoreRequest>>);
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const ask = () => request(app).post(url).set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "hi" });

    await ask().expect(503);
    const history = await request(app).get(url).set("Cookie", cookie).expect(200);
    expect(history.body.messages).toHaveLength(0);
    await ask().expect(200);
    expect(core).toHaveBeenCalledTimes(2);
    expect(core.mock.calls[1]?.[0].options?.conversation_mode).toBe(true);
  });

  it("keeps ledger questions available after AI quota is exhausted and reports quota details for model requests", async () => {
    const userId = new Types.ObjectId(ownerUserId);
    const { orgId } = await ensurePersonalOrgForUser(userId);
    await recordFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 100_000 });
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const ask = (content: string) => request(app).post(url)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({ content });
    vi.mocked(processAiCoreRequest).mockClear();
    const limited = await ask("Explain the difference between an emergency fund and a sinking fund.").expect(402);
    expect(limited.body.details).toMatchObject({ feature: "monthly_ai_calls", limit: expect.any(Number), used: expect.any(Number) });
    await ask("How much did I spend this month?").expect(200);
    const followUp = await ask("And last month?").expect(200);
    expect(followUp.body.assistantMessage.metadata).toMatchObject({ analysisType: "monthly_spending", llmCallCount: 0 });
    expect(processAiCoreRequest).not.toHaveBeenCalled();
  });

  it("regenerates an answer without storing a second user question", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const first = await request(app).post(url)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "How is my budget?" }).expect(200);
    const outputId = first.body.assistantMessage.metadata.agentOutputId;
    expect(outputId).toBeTruthy();
    const second = await request(app).post(url)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "How is my budget?", options: { regenerate_of: outputId, bypass_cache: true } }).expect(200);
    expect(second.body.userMessage.id).toBe(first.body.userMessage.id);
    expect(second.body.assistantMessage.id).not.toBe(first.body.assistantMessage.id);
    const history = await request(app).get(url).set("Cookie", cookie).expect(200);
    expect(history.body.messages.filter((message: any) => message.role === "user")).toHaveLength(1);
    expect(history.body.messages.filter((message: any) => message.role === "assistant")).toHaveLength(2);
    await request(app).post(url).set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Changed prompt", options: { regenerate_of: outputId } }).expect(404);
  });

  it("keeps safe provider recovery details after reloading a conversation", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const url = `/api/chat/sessions/${created.body.id}/messages`;
    const sent = await request(app).post(url)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "What is an emergency fund?" }).expect(200);
    const history = await request(app).get(url).set("Cookie", cookie).expect(200);
    for (const message of [sent.body.assistantMessage, history.body.messages.at(-1)]) {
      expect(message.metadata).toMatchObject({
        activeProvider: "groq",
        activeModel: "openai/gpt-oss-20b",
        recoveredFailureCount: 1,
        fallbackUsed: false,
      });
      expect(JSON.stringify(message.metadata)).not.toContain("internal-key-reference");
    }
  });

  it("creates a real PDF from chat, persists its card, and enforces file ownership", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    vi.mocked(processAiCoreRequest).mockClear();
    const content = "Create a PDF document titled Student Budget QA.\nContent:\n# Synthetic budget\nMonthly income USD 7500.\n- Save USD 500 monthly\n- Review progress";
    const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({ content }).expect(200);
    expect(processAiCoreRequest).not.toHaveBeenCalled();
    expect(sent.body.assistantMessage.content).toMatch(/saved in Files/);
    expect(sent.body.assistantMessage.metadata.llmCallCount).toBe(0);
    const document = sent.body.assistantMessage.metadata.generatedDocuments[0];
    expect(document.filename).toBe("student_budget_qa.pdf");
    const history = await request(app).get(`/api/chat/sessions/${created.body.id}/messages`).set("Cookie", cookie).expect(200);
    expect(history.body.messages.at(-1).metadata.generatedDocuments).toEqual([document]);
    const file = await request(app).get(`/api/files/${document.workspaceFileId}`).set("Cookie", cookie).expect(200);
    expect(JSON.stringify(file.body)).toContain("Monthly income USD 7500");
    expect(file.body.file.extractedPageCount).toBe(1);
    await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "What monthly savings amount is stated in this attached PDF?", fileIds: [document.workspaceFileId] }).expect(200);
    const chunks = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].finance_context?.retrieval as any;
    expect(chunks.top_chunks.some((chunk: any) => chunk.workspace_file_id === document.workspaceFileId && chunk.page_number === 1 && chunk.text.includes("USD 500"))).toBe(true);
    const pdf = await request(app).get(`/api/files/rendered/${document.fileId}/download`).set("Cookie", cookie).expect(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    const other = await createAuthedUser();
    await request(app).get(`/api/files/${document.workspaceFileId}`).set("Cookie", other.cookie).expect(404);
    const denied = await request(app).get(`/api/files/rendered/${document.fileId}/download`).set("Cookie", other.cookie);
    expect([403, 404]).toContain(denied.status);
  });

  it("downloads a local PDF with no Files record and preserves ownership", async () => {
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const sessionId = created.body.id;
    const url = `/api/chat/sessions/${sessionId}/messages`;
    const core = vi.mocked(processAiCoreRequest);
    core.mockClear();
    const sent = await request(app).post(url).set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "Make a PDF titled Local Checklist. Content: Pack water and a notebook.", options: { file_destination: "local" } })
      .expect(200);
    expect(core).not.toHaveBeenCalled();
    const reply = sent.body.assistantMessage;
    expect(reply.metadata.localDocument).toMatchObject({ title: "Local Checklist", content: "Pack water and a notebook." });
    expect(reply.metadata.generatedDocuments).toHaveLength(0);
    const download = `${url}/${reply.id}/download`;
    const pdf = await request(app).get(download).set("Cookie", cookie).expect(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.headers["content-disposition"]).toContain("local_checklist.pdf");
    expect(pdf.headers["cache-control"]).toContain("no-store");
    expect(await WorkspaceFileModel.countDocuments()).toBe(0);
    const other = await createAuthedUser();
    await request(app).get(download).set("Cookie", other.cookie).expect(404);
  });

  it("drafts a cloud text file with one model call and keeps it in Files", async () => {
    const headers = [cookie, csrfCookie];
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const core = vi.mocked(processAiCoreRequest);
    core.mockClear().mockResolvedValueOnce({
      success: true, final_output: "चाय के लिए ₹50 रखें।", analysis_type: "document_draft", agent: "document_draft",
      agents_involved: ["document_draft"], detailed_analysis: {}, insights: [], workflow_trace: [], fallback_used: false,
      llm_call_count: 1, request_id: "draft-text-test", active_provider: "groq",
    });
    const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", headers).set("X-CSRF-Token", csrfToken)
      .send({ content: "Create a text file titled Tea Note. Write a single line in Hindi about setting aside ₹50 for tea.", options: { file_destination: "cloud" } })
      .expect(200);
    expect(core).toHaveBeenCalledTimes(1);
    expect(core.mock.calls[0]?.[0]).toMatchObject({ user_profile: null, options: { conversation_mode: true, document_draft: true } });
    const file = sent.body.assistantMessage.metadata.generatedDocuments[0];
    expect(file).toMatchObject({ filename: "tea_note.txt", mimeType: "text/plain" });
    const downloaded = await request(app).get(`/api/files/rendered/${file.fileId}/download`).set("Cookie", cookie).expect(200);
    expect(downloaded.text).toBe("चाय के लिए ₹50 रखें।");
    const saved = await WorkspaceFileModel.findById(file.workspaceFileId).lean();
    expect(saved?.extractedText).toBe("चाय के लिए ₹50 रखें।");
  });

  it("indexes verified physical pages of a generated multipage PDF", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const body = Array.from({ length: 70 }, (_, i) => `Review item ${i + 1}: Synthetic budget progress check.`).join("\n") + "\nFINAL PAYMENT TERMS\nFinal fee USD 37.";
    const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: `Create a PDF titled Multipage QA. Content:\n${body}` }).expect(200);
    const document = sent.body.assistantMessage.metadata.generatedDocuments[0];
    const file = await request(app).get(`/api/files/${document.workspaceFileId}`).set("Cookie", cookie).expect(200);
    expect(file.body.file.extractedPageCount).toBeGreaterThan(1);
    const page = file.body.file.extractedText.split("\f").findIndex((text: string) => text.includes("Final fee USD 37")) + 1;
    expect(page).toBeGreaterThan(1);
    await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "What is the final fee in my attached PDF?", fileIds: [document.workspaceFileId] }).expect(200);
    const chunks = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].finance_context?.retrieval as any;
    expect(chunks.top_chunks.some((chunk: any) => chunk.text.includes("Final fee USD 37") && chunk.page_number === page)).toBe(true);
  });

  it("keeps the PDF usable without inventing pages when verification fails", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const spy = vi.spyOn(fileTextExtraction, "extractWorkspaceFileText").mockRejectedValueOnce(new Error("Parser unavailable"));
    try {
      const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
        .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
        .send({ content: "Create a PDF titled Fallback QA. Content: Synthetic\fsavings USD 500" }).expect(200);
      const document = sent.body.assistantMessage.metadata.generatedDocuments[0];
      const file = await request(app).get(`/api/files/${document.workspaceFileId}`).set("Cookie", cookie).expect(200);
      expect(file.body.file.extractedPageCount).toBeUndefined();
      expect(file.body.file.extractedText).toBe("Synthetic\nsavings USD 500");
      expect(file.body.file.extractionWarnings.join(" ")).toContain("could not be verified");
      await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
        .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
        .send({ content: "What savings amount is in this attached PDF?", fileIds: [document.workspaceFileId] }).expect(200);
      const chunks = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].finance_context?.retrieval as any;
      expect(chunks.top_chunks.every((chunk: any) => chunk.page_number == null)).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it("creates a saved-activity PDF using only the current user's records", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const orgId = created.body.org_id;
    const foreign = await createAuthedUser();
    await FinancialProfileModel.create({ orgId, userId: ownerUserId, age: 30, annual_income: 90000,
      monthly_expenses: 3000, savings: 15000, goals: [{ name: "Owned buffer", target: 1250.5, current: 25.25, deadline: "2027-05-01", priority: 1 }] });
    const task = { orgId, bucket: 7, why: "Review saved activity", expected_impact: "Stay on track", priority: "high" };
    await TaskModel.create([
      { ...task, _id: "owned-open", userId: ownerUserId, title: "Owned next task", status: "open" },
      { ...task, _id: "owned-done", userId: ownerUserId, title: "Completed private task", status: "completed" },
      { ...task, _id: "foreign-open", userId: foreign.user._id, title: "Foreign private task", status: "open" },
    ]);
    vi.mocked(processAiCoreRequest).mockClear();
    const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Create a document summarizing my saved goals and open tasks." }).expect(200);
    expect(processAiCoreRequest).not.toHaveBeenCalled();
    expect(sent.body.assistantMessage.content).toContain("saved workspace records");
    const document = sent.body.assistantMessage.metadata.generatedDocuments[0];
    const file = await request(app).get(`/api/files/${document.workspaceFileId}`).set("Cookie", cookie).expect(200);
    const text = file.body.file.extractedText;
    expect(text).toContain("Owned buffer");
    expect(text).toContain("USD 25.25 saved toward USD 1250.50");
    expect(text).toContain("Owned next task");
    expect(text).not.toMatch(/Foreign private task|Completed private task|Annual income/);
    expect(file.body.file.extractedPageCount).toBeGreaterThan(0);
    await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Review my saved goals and tasks" }).expect(200);
    let context = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].finance_context as any;
    expect(context.goals[0]).toMatchObject({ name: "Owned buffer", current: 25.25, target: 1250.5 });
    expect(context.tasks.map((item: any) => item.title)).toEqual(["Owned next task"]);
    await TaskModel.updateOne({ _id: "owned-open" }, { status: "completed" });
    await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Review my saved goals and tasks" }).expect(200);
    context = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].finance_context as any;
    expect(context.tasks).toEqual([]);
  });

  it("asks for document contents instead of creating an unrelated financial plan", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    vi.mocked(processAiCoreRequest).mockClear();
    const sent = await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Please create a document." }).expect(200);
    expect(processAiCoreRequest).not.toHaveBeenCalled();
    expect(sent.body.assistantMessage.content).toContain("Content:");
    expect(sent.body.assistantMessage.metadata.generatedDocuments).toEqual([]);
  });

  it("keeps previous document questions as context when summarizing conversations", async () => {
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    await request(app).post(`/api/chat/sessions/${created.body.id}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "What is the fee in my attached PDF?", options: { narrative: false } }).expect(200);
    expect(vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0].options?.include_document_passages).not.toBe(false);

    const summary = await request(app).get("/api/chat/insights/conversation").set("Cookie", cookie).expect(200);
    expect(summary.body.sessions_considered).toBe(1);
    const payload = vi.mocked(processAiCoreRequest).mock.calls.at(-1)?.[0];
    expect(payload?.options).toMatchObject({ narrative: true, include_document_passages: false, task_type: "conversation_insights" });
    expect((payload?.finance_context?.conversation_sessions as any[])?.[0].id).toBe(created.body.id);
    expect(payload?.finance_context).toBeTruthy();
    expect(payload?.org_id).toBeTruthy();
    expect(payload?.user_id).toBeTruthy();
    expect(payload?.user_input).not.toContain("What is the fee in my attached PDF?");
    expect(payload?.session_summary).toContain("What is the fee in my attached PDF?");
    expect(summary.body.cache_hit).toBe(false);
    const calls = vi.mocked(processAiCoreRequest).mock.calls.length;
    const summaryUsage = () => UsageEventModel.countDocuments({
      userId: ownerUserId, "context.endpoint": "chat/conversation-insights",
    });
    expect(await summaryUsage()).toBe(1);
    const reused = await request(app).get("/api/chat/insights/conversation").set("Cookie", cookie).expect(200);
    expect(reused.body.cache_hit).toBe(true);
    expect(reused.body.llm_call_count).toBe(0);
    expect(reused.body.workflow_trace).toEqual([]);
    expect(reused.body.request_id).not.toBe(summary.body.request_id);
    expect(reused.body.generated_at).toBe(summary.body.generated_at);
    expect(vi.mocked(processAiCoreRequest).mock.calls.length).toBe(calls);
    expect(await summaryUsage()).toBe(1);
    const refreshed = await request(app).get("/api/chat/insights/conversation?refresh=1").set("Cookie", cookie).expect(200);
    expect(refreshed.body.cache_hit).toBe(false);
    expect(vi.mocked(processAiCoreRequest).mock.calls.length).toBe(calls + 1);
    await TaskModel.create({
      _id: "new-insight-cache-priority", orgId: payload?.org_id, userId: ownerUserId, title: "New current priority",
      why: "Refresh current context", priority: "high", bucket: 7, status: "open",
      kind: "budget", steps: [], expected_impact: "Keep insights current",
    });
    const changed = await request(app).get("/api/chat/insights/conversation").set("Cookie", cookie).expect(200);
    expect(changed.body.cache_hit).toBe(false);
    expect(vi.mocked(processAiCoreRequest).mock.calls.length).toBe(calls + 2);
    expect(await summaryUsage()).toBe(3);
    await recordFeatureUsage({ orgId: new Types.ObjectId(payload!.org_id), userId: new Types.ObjectId(ownerUserId), feature: "monthly_ai_calls", units: 100_000 });
    // Reading an already computed owned result costs no new AI unit.
    await request(app).get("/api/chat/insights/conversation").set("Cookie", cookie).expect(200);
    const limited = await request(app).get("/api/chat/insights/conversation?refresh=1").set("Cookie", cookie).expect(402);
    expect(limited.body.code).toBe("FEATURE_LIMIT_REACHED");
    expect(vi.mocked(processAiCoreRequest).mock.calls.length).toBe(calls + 2);
  });

  it("creates, sends, lists, renames, and deletes chat sessions on /api", async () => {
    const created = await request(app)
      .post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(201);

    expect(created.body.id).toBeTruthy();
    expect(created.body.request_id).toBeTruthy();
    expect(created.body.org_id).toBeTruthy();

    const sessionId = String(created.body.id);

    const listed = await request(app)
      .get("/api/chat/sessions?page=1&limit=20")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(listed.body.sessions)).toBe(true);
    expect(listed.body.sessions).toHaveLength(1);
    expect(listed.body.sessions[0].id).toBe(sessionId);
    expect(listed.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(listed.body.request_id).toBeTruthy();
    expect(listed.body.org_id).toBeTruthy();

    const sent = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        content: "Help me reduce expenses this month.",
        options: { narrative: false },
      })
      .expect(200);

    expect(sent.body.userMessage.role).toBe("user");
    expect(sent.body.assistantMessage.role).toBe("assistant");
    expect(sent.body.assistantMessage.content).toContain("Deterministic");
    expect(sent.body.assistantMessage.metadata.workflowTrace[0]).toMatchObject({
      latencyMs: 12.5, llmCalls: 0, tokenCount: 0, cacheHit: true,
    });
    expect(sent.body.request_id).toBeTruthy();
    expect(sent.body.org_id).toBeTruthy();

    const messages = await request(app)
      .get(`/api/chat/sessions/${sessionId}/messages?page=1&limit=50`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(messages.body.messages)).toBe(true);
    expect(messages.body.messages).toHaveLength(2);
    expect(messages.body.messages[0].role).toBe("user");
    expect(messages.body.messages[1].role).toBe("assistant");
    expect(messages.body.messages[1].metadata.workflowTrace).toEqual(sent.body.assistantMessage.metadata.workflowTrace);
    expect(messages.body.pagination.total).toBe(2);

    await request(app)
      .patch(`/api/chat/sessions/${sessionId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ title: "Monthly cost review" })
      .expect(200);

    await request(app)
      .delete(`/api/chat/sessions/${sessionId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);
  }, 15000);

  it("retains attached PDF citations and confidence in the response and reloaded conversation", async () => {
    const uploaded = await request(app).post("/api/files")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .attach("files", await createTextPdf(["", "Income USD 7500", "", "Prepayment fee USD 25"]), {
        filename: "cited-loan.pdf", contentType: "application/pdf",
      }).expect(201);
    const fileId = uploaded.body.files[0].id;
    const created = await request(app).post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send({}).expect(201);
    const sessionId = created.body.id;
    const sent = await request(app).post(`/api/chat/sessions/${sessionId}/messages`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ content: "Review the prepayment fee", fileIds: [fileId] }).expect(200);
    const metadata = sent.body.assistantMessage.metadata;
    expect(metadata.evidence.find((item: any) => item.type === "retrieval_chunk"))
      .toMatchObject({ page_number: 4, entity_id: fileId, snippet: expect.stringContaining("Prepayment fee USD 25") });
    expect(metadata.confidence).toMatchObject({ score: expect.any(Number), label: expect.any(String) });
    expect(metadata.suggestedActions[0]?.title).toBe("Review the payment clause");
    expect(metadata.linkedEntityIds.files).toContain(fileId);
    const messages = await request(app).get(`/api/chat/sessions/${sessionId}/messages`).set("Cookie", cookie).expect(200);
    const reloaded = messages.body.messages.find((message: any) => message.role === "assistant").metadata;
    for (const key of ["evidence", "confidence", "suggestedActions", "linkedEntityIds"]) {
      expect(reloaded[key]).toEqual(metadata[key]);
    }
    const foreign = await createAuthedUser();
    await request(app).get(`/api/chat/sessions/${sessionId}/messages`).set("Cookie", foreign.cookie).expect(404);
  });

  it("persists an autopilot run when tool calls are present", async () => {
    const mockedAi = vi.mocked(processAiCoreRequest);
    mockedAi.mockImplementationOnce(async (_payload: any, requestId: string) => ({
      success: true,
      final_output: "Autopilot test output.",
      agent: "master",
      actionType: "review",
      priority: "medium",
      insights: [],
      analysis_type: "comprehensive",
      agents_involved: ["master"],
      detailed_analysis: {},
      workflow_trace: [],
      fallback_used: false,
      llm_call_count: 0,
      request_id: requestId,
      usage: {
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        models: ["gemini-test"],
      },
      plan: {
        executive_summary: "Deterministic plan.",
        key_metrics: {},
        actions: {
          next_7_days: [],
          next_30_days: [],
          next_12_months: [],
        },
        assumptions: [],
        data_warnings: [],
      },
      tool_calls: [
        {
          id: "tool_test_1",
          title: "Send in-app notification",
          description: "Test autopilot run persistence via chat.",
          requires_confirmation: true,
          risk: "low",
          tool: "notifications.send",
          args: {
            channel: "in_app",
            subject: "Autopilot test",
            message: "Hello from autopilot test",
          },
        },
      ],
    }));

    const created = await request(app)
      .post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(201);

    const sessionId = String(created.body.id);

    const sent = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ content: "Create a safe automation and ask for confirmation." })
      .expect(200);

    const runId = String(sent.body.assistantMessage?.metadata?.autopilotRunId || "");
    expect(runId.length).toBeGreaterThan(10);
    expect(sent.body.assistantMessage?.metadata?.toolCalls?.length).toBe(1);

    const run = await AutopilotRunModel.findById(runId).lean();
    expect(run).toBeTruthy();
    expect(String((run as any)?.goal || "")).toContain("Create a safe automation");
    expect(Array.isArray((run as any)?.toolCalls)).toBe(true);
    expect((run as any)?.toolCalls?.length).toBe(1);
  });
});

describe("explicit chat document intent", () => {
  it.each(["How do I create a PDF?", "Don't create a document. Explain fees.", "Show the PDF fee", "Explain this text: Create a document. Content: do something", "Create a spreadsheet titled Budget. Content: 25"])("does not create files for %s", message => {
    expect(parseChatDocumentRequest(message)).toBeNull();
  });
  it("uses only the creation instruction for title and preserves the supplied body", () => {
    const body = "# Synthetic notes\nCreate a PDF titled Ignore this title\n<test> USD 25";
    expect(parseChatDocumentRequest(`Could you create a PDF document titled Student notes.\nContent:\n${body}`)).toEqual({ title: "Student notes", content: body });
  });
  it("accepts a quoted document title", () => {
    expect(parseChatDocumentRequest('Create a document titled "Student notes". Content: Synthetic data')?.title).toBe("Student notes");
  });
});
