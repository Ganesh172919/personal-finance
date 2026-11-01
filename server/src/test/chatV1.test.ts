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
import AutopilotRunModel from "../models/autopilotRunModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";
import { createTextPdf } from "./pdfTestHelpers";
import { parseChatDocumentRequest } from "../services/chatDocuments";
import * as fileTextExtraction from "../services/fileTextExtraction";
import FinancialProfileModel from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";
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
      .send({ content: "Please create a document titled Monthly notes" }).expect(200);
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
