import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("v1 workflows API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let orgId = "";
  let userId = "";

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
    userId = auth.user._id.toString();
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("creates and runs a workflow (inline)", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Create tasks from workflow",
        trigger: { type: "manual" },
        actions: [
          {
            type: "create_task",
            bucket: 7,
            title: "Review subscriptions",
            why: "Reduce recurring spend and improve cash flow.",
            steps: ["List top subscriptions", "Cancel unused services"],
            priority: "high",
            expected_impact: "Lowers monthly expenses.",
            kind: "budget",
            due_days: 7,
          },
        ],
      })
      .expect(201);

    const workflowId = created.body.workflow?.id as string;
    expect(workflowId).toMatch(/^[a-f\d]{24}$/i);

    const run = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ idempotency_key: "idem-12345678" })
      .expect(200);

    expect(run.body.queued).toBe(false);
    expect(run.body.run?.status).toBe("succeeded");
    expect(run.body.run?.result?.tasks_created?.length).toBe(1);

    const tasks = await request(app)
      .get("/api/tasks?status=open&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(tasks.body.tasks).toHaveLength(1);
    expect(tasks.body.tasks[0].title).toBe("Review subscriptions");
  });

  it("runs workflow actions: export_report + send_notification", async () => {
    await EntitlementModel.create({
      orgId,
      userId,
      plan: "pro",
      status: "active",
    });

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 500,
        category: "Utilities",
        description: "Internet bill",
        date: "2026-02-02",
        type: "expense",
      })
      .expect(201);

    const created = await request(app)
      .post("/api/workflows")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Export + notify",
        trigger: { type: "manual" },
        actions: [
          {
            type: "export_report",
            export_type: "transactions_csv",
            params: {},
          },
          {
            type: "send_notification",
            channel: "email",
            subject: "FinWise export ready",
            message: "Your automated export has been generated.",
          },
        ],
      })
      .expect(201);

    const workflowId = created.body.workflow?.id as string;

    const run = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ idempotency_key: "idem-export-notify" })
      .expect(200);

    expect(run.body.queued).toBe(false);
    expect(run.body.run?.status).toBe("succeeded");
    expect(run.body.run?.result?.exports_created?.length).toBe(1);
    expect(run.body.run?.result?.notifications_sent?.length).toBe(1);

    const exportId = run.body.run.result.exports_created[0] as string;
    const download = await request(app)
      .get(`/api/exports/${exportId}/download`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(String(download.headers["content-type"] || "")).toContain("text/csv");
    expect(download.text).toContain("Utilities");
    expect(download.text).toContain("Internet bill");
  }, 20_000);

  it("creates a webhook workflow and executes it via external webhook POST with payload interpolation and multi-step branch conditions", async () => {
    // Create workflow with webhook trigger and multi-step conditional branch logic
    const created = await request(app)
      .post("/api/workflows")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "External Alert Webhook",
        trigger: { type: "webhook" },
        actions: [
          // Action 1: Condition matches (amount >= 100) -> will execute with templated title
          {
            type: "create_task",
            bucket: 7,
            title: "Audit high spend: {{merchant}}",
            why: "Investigate transaction of ${{amount}}",
            steps: ["Check receipt for {{merchant}}", "Verify budget allowance"],
            priority: "high",
            expected_impact: "Avoids budget overflow.",
            kind: "budget",
            condition: {
              field: "amount",
              operator: "gte",
              value: 100,
            },
          },
          // Action 2: Condition does NOT match (amount >= 5000) -> should be skipped
          {
            type: "send_notification",
            channel: "in_app",
            subject: "Emergency Outlier: {{merchant}}",
            message: "Extreme spend alert for ${{amount}}",
            condition: {
              field: "amount",
              operator: "gte",
              value: 5000,
            },
          },
          // Action 3: Unconditional notification -> will execute
          {
            type: "send_notification",
            channel: "in_app",
            subject: "Spend Logged: {{merchant}}",
            message: "Recorded ${{amount}} for category {{category}}",
          },
        ],
      })
      .expect(201);

    const trigger = created.body.workflow?.trigger;
    expect(trigger?.type).toBe("webhook");
    expect(trigger?.webhook_token).toBeDefined();
    expect(typeof trigger?.webhook_token).toBe("string");
    expect(trigger?.webhook_token.length).toBeGreaterThanOrEqual(24);

    const webhookToken = trigger.webhook_token;

    // Trigger workflow via external HTTP POST (no session cookie or CSRF header required)
    const webhookRes = await request(app)
      .post(`/api/workflows/webhook/${webhookToken}`)
      .send({
        merchant: "Acme Cloud Services",
        amount: 250,
        category: "Software",
        severity: "medium",
      })
      .expect(200);

    expect(webhookRes.body.success).toBe(true);
    expect(webhookRes.body.run?.status).toBe("succeeded");

    const result = webhookRes.body.run?.result;
    expect(result?.tasks_created?.length).toBe(1);
    expect(result?.notifications_sent?.length).toBe(1); // Only action 3 executed, action 2 skipped
    expect(result?.actions_skipped?.length).toBe(1); // Action 2 skipped
    expect(result?.actions_skipped[0].index).toBe(1);
    expect(result?.actions_skipped[0].reason).toContain("Condition not met");

    // Verify task was created with interpolated title and steps
    const tasksRes = await request(app)
      .get("/api/tasks?status=open&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const createdTask = tasksRes.body.tasks.find((t: any) => t.title.includes("Acme Cloud Services"));
    expect(createdTask).toBeDefined();
    expect(createdTask.title).toBe("Audit high spend: Acme Cloud Services");
    expect(createdTask.why).toBe("Investigate transaction of $250");
    expect(createdTask.steps[0]).toBe("Check receipt for Acme Cloud Services");
  });

  it("rejects webhook execution if workflow is disabled or token is invalid", async () => {
    // 1. Invalid token -> 404
    await request(app)
      .post("/api/workflows/webhook/invalid_nonexistent_token_123456")
      .send({ ping: true })
      .expect(404);

    // 2. Create disabled webhook workflow
    const created = await request(app)
      .post("/api/workflows")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Disabled Webhook Workflow",
        enabled: false,
        trigger: { type: "webhook" },
        actions: [
          {
            type: "create_task",
            bucket: 30,
            title: "Disabled task",
            why: "Test",
            steps: [],
            priority: "low",
            expected_impact: "None",
            kind: "generic",
          },
        ],
      })
      .expect(201);

    const token = created.body.workflow?.trigger?.webhook_token;

    // Disabled workflow -> 400 WORKFLOW_DISABLED
    const disabledRes = await request(app)
      .post(`/api/workflows/webhook/${token}`)
      .send({ data: "test" })
      .expect(400);

    expect(disabledRes.body.code).toBe("WORKFLOW_DISABLED");
  });
});
