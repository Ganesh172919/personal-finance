import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiCoreClient", async () => {
  const actual = await vi.importActual<typeof import("../services/aiCoreClient")>("../services/aiCoreClient");
  return {
    ...actual,
    processAiCoreReceiptOcr: vi.fn(async () => ({
      success: true,
      extracted: {
        vendor: "ACME STORE",
        date: "2026-02-12",
        total: 123.45,
        tax: 10,
        currency: "INR",
        items: [{ description: "Milk", total: 55, confidence: 0.8 }],
        raw_text: "ACME STORE\nTotal 123.45",
        category_suggestion: "Groceries",
      },
      confidence: { vendor: 0.9, date: 0.8, total: 0.9, tax: 0.7, currency: 1.0, items: [{ line: 0.8 }] },
      warnings: [],
      request_id: "mock-ocr",
    })),
    processAiCoreHandwriting: vi.fn(async () => ({
      success: true,
      recognized_text: "save 5000",
      confidence: { overall: 0.7, lines: [{ text: "save 5000", confidence: 0.7 }] },
      detected_values: { amounts: [{ value: 5000 }], percentages: [], dates: [], goal_candidates: [], budget_adjustments: [] },
      warnings: [],
      request_id: "mock-hw",
    })),
    processAiCoreRequest: vi.fn(async () => ({
      success: true,
      final_output: "ok",
      agent: "master",
      actionType: "review",
      priority: "medium",
      plan: {
        executive_summary: "ok",
        key_metrics: {},
        actions: { next_7_days: [], next_30_days: [], next_12_months: [] },
        assumptions: [],
        data_warnings: [],
      },
      insights: [],
      analysis_type: "comprehensive",
      agents_involved: ["master"],
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
import ReceiptModel from "../models/receiptModel";
import { processAiCoreReceiptOcr } from "../services/aiCoreClient";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("receipts OCR API", () => {
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

  it("parses, confirms, and serves receipt media", async () => {
    const parseRes = await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "receipt.png", contentType: "image/png" })
      .field("currencyHint", "INR")
      .expect(200);

    expect(parseRes.body.receipt_id).toBeTruthy();
    expect(parseRes.body.file_id).toBeTruthy();
    expect(parseRes.body.extracted).toMatchObject({
      vendor: "ACME STORE",
      date: "2026-02-12",
      total: 123.45,
    });

    const receipts = await ReceiptModel.find().lean();
    expect(receipts).toHaveLength(1);

    const confirmRes = await request(app)
      .post(`/api/receipts/${parseRes.body.receipt_id}/confirm`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        vendor: "ACME STORE",
        date: "2026-02-12",
        total: 123.45,
        tax: 10,
        currency: "INR",
        category: "Groceries",
        description: "Receipt expense",
      })
      .expect(200);

    expect(confirmRes.body.transaction).toMatchObject({
      type: "expense",
      category: "Groceries",
      amount: -123.45,
      source: { origin: "receipt_ocr" },
    });
    expect(confirmRes.body.receipt.status).toBe("confirmed");
    expect(confirmRes.body.receipt.transactionId).toBeTruthy();

    await request(app)
      .get(`/api/media/${parseRes.body.file_id}`)
      .set("Cookie", [cookie])
      .expect(200);
  });

  it("defaults OCR currency hint to org currency when omitted", async () => {
    vi.mocked(processAiCoreReceiptOcr).mockClear();

    await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "receipt.png", contentType: "image/png" })
      .expect(200);

    expect(vi.mocked(processAiCoreReceiptOcr)).toHaveBeenCalled();
    const firstCall = vi.mocked(processAiCoreReceiptOcr).mock.calls[0];
    expect(firstCall?.[0]?.currencyHint).toBe("USD");
  });

  it("deletes parsed receipts and blocks deletion after confirmation", async () => {
    const parseRes = await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng"), { filename: "receipt.png", contentType: "image/png" })
      .field("currencyHint", "INR")
      .expect(200);

    const receiptId = String(parseRes.body.receipt_id);
    const fileId = String(parseRes.body.file_id);

    await request(app)
      .delete(`/api/receipts/${receiptId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    await request(app)
      .get(`/api/media/${fileId}`)
      .set("Cookie", [cookie])
      .expect(404);

    const parse2 = await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("fakepng2"), { filename: "receipt2.png", contentType: "image/png" })
      .field("currencyHint", "INR")
      .expect(200);

    const receipt2Id = String(parse2.body.receipt_id);

    await request(app)
      .post(`/api/receipts/${receipt2Id}/confirm`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        vendor: "ACME STORE",
        date: "2026-02-12",
        total: 123.45,
        tax: 10,
        currency: "INR",
        category: "Groceries",
        description: "Receipt expense",
      })
      .expect(200);

    const deleteRes = await request(app)
      .delete(`/api/receipts/${receipt2Id}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(409);

    expect(deleteRes.body.code).toBe("RECEIPT_CONFIRMED");
  });
});
