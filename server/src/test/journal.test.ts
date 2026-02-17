import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiCoreClient", async () => {
  const actual = await vi.importActual<typeof import("../services/aiCoreClient")>("../services/aiCoreClient");
  return {
    ...actual,
    processAiCoreHandwriting: vi.fn(async () => ({
      success: true,
      recognized_text: "savings target: ₹5000",
      confidence: { overall: 0.72, lines: [{ text: "savings target: ₹5000", confidence: 0.72 }] },
      detected_values: {
        amounts: [{ value: 5000, currency: "INR", raw: "₹5000" }],
        percentages: [],
        dates: [],
        goal_candidates: [{ name: "Savings Target", target: 5000, currency: "INR" }],
        budget_adjustments: [],
      },
      warnings: [],
      request_id: "mock-hw",
    })),
    processAiCoreReceiptOcr: vi.fn(async () => ({
      success: true,
      extracted: {},
      confidence: {},
      warnings: [],
      request_id: "mock-ocr",
    })),
    processAiCoreRequest: vi.fn(async () => ({
      success: true,
      final_output: "Keep saving consistently.",
      agent: "financial_educator",
      actionType: "review",
      priority: "medium",
      plan: {
        executive_summary: "Summary",
        key_metrics: {},
        actions: { next_7_days: [], next_30_days: [], next_12_months: [] },
        assumptions: [],
        data_warnings: [],
      },
      insights: [],
      analysis_type: "comprehensive",
      agents_involved: ["financial_educator"],
      detailed_analysis: {},
      workflow_trace: [],
      fallback_used: false,
      llm_call_count: 0,
      request_id: "mock-ai",
    })),
  };
});

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AgentOutputModel from "../models/agentOutputModel";
import JournalEntryModel from "../models/journalEntryModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("financial journal API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";

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

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("recognizes handwriting and stores annotations", async () => {
    const res = await request(app)
      .post("/api/financial-journal/recognize-handwriting")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "journal.png", contentType: "image/png" })
      .field("strokes", JSON.stringify([{ x: 0.1, y: 0.2 }]))
      .expect(200);

    expect(res.body.entry_id).toBeTruthy();
    expect(res.body.recognized_text).toContain("5000");

    const entries = await JournalEntryModel.find().lean();
    expect(entries).toHaveLength(1);

    const outputs = await AgentOutputModel.find({ agentType: "journal_annotation" }).lean();
    expect(outputs.length).toBe(1);
  });

  it("generates journal insights via AI core", async () => {
    const recognized = await request(app)
      .post("/api/financial-journal/recognize-handwriting")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "journal.png", contentType: "image/png" })
      .expect(200);

    const insights = await request(app)
      .post(`/api/financial-journal/entries/${recognized.body.entry_id}/insights`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(200);

    expect(insights.body.response).toContain("saving");

    const outputs = await AgentOutputModel.find({ agentType: "journal_insights" }).lean();
    expect(outputs.length).toBe(1);
  });

  it("patches recognized text and recomputes parsed intent", async () => {
    const recognized = await request(app)
      .post("/api/financial-journal/recognize-handwriting")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "journal.png", contentType: "image/png" })
      .expect(200);

    const entryId = String(recognized.body.entry_id);

    const patchRes = await request(app)
      .patch(`/api/financial-journal/entries/${entryId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ recognized_text: "save 5000 and increase savings by 10% by 01/03/2026" })
      .expect(200);

    expect(patchRes.body.entry.recognizedText).toContain("save 5000");
    expect(patchRes.body.entry.parsedIntent.amounts.some((a: any) => a.value === 5000)).toBe(true);
    expect(patchRes.body.entry.parsedIntent.percentages).toContain(10);
    expect(patchRes.body.entry.parsedIntent.dates).toContain("2026-03-01");
  });
});
