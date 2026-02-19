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
    })),
  };
});

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("chat v1 API", () => {
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

    const csrf = await request(app).get("/api/v1/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token || "");
    expect(csrfToken.length).toBeGreaterThan(10);
  });

  it("creates, sends, lists, renames, and deletes chat sessions on /api/v1", async () => {
    const created = await request(app)
      .post("/api/v1/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(201);

    expect(created.body.id).toBeTruthy();
    expect(created.body.request_id).toBeTruthy();
    expect(created.body.org_id).toBeTruthy();

    const sessionId = String(created.body.id);

    const listed = await request(app)
      .get("/api/v1/chat/sessions?page=1&limit=20")
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
      .post(`/api/v1/chat/sessions/${sessionId}/messages`)
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
    expect(sent.body.request_id).toBeTruthy();
    expect(sent.body.org_id).toBeTruthy();

    const messages = await request(app)
      .get(`/api/v1/chat/sessions/${sessionId}/messages?page=1&limit=50`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(messages.body.messages)).toBe(true);
    expect(messages.body.messages).toHaveLength(2);
    expect(messages.body.messages[0].role).toBe("user");
    expect(messages.body.messages[1].role).toBe("assistant");
    expect(messages.body.pagination.total).toBe(2);

    await request(app)
      .patch(`/api/v1/chat/sessions/${sessionId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ title: "Monthly cost review" })
      .expect(200);

    await request(app)
      .delete(`/api/v1/chat/sessions/${sessionId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);
  }, 15000);
});
