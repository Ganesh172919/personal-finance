import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TaskModel from "../models/taskModel";
import OrganizationModel from "../models/organizationModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Tasks External Webhook Triggers & Third-Party Sync API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    await startTestDb();
    await TaskModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    userId = auth.user._id.toString();
    const org = await ensurePersonalOrgForUser(auth.user._id);
    orgId = String(org.orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("retrieves or generates the organization task webhook token", async () => {
    const res = await request(app)
      .get("/api/tasks/webhook-token")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(res.body.webhook_token).toBeDefined();
    expect(res.body.webhook_token.length).toBeGreaterThanOrEqual(24);
    expect(res.body.webhook_path).toContain(res.body.webhook_token);

    // Verify token persisted on the organization document
    const orgDoc = await OrganizationModel.findById(orgId);
    expect(orgDoc?.taskWebhookToken).toBe(res.body.webhook_token);
  });

  it("creates a task via inbound webhook without session cookies (third-party trigger)", async () => {
    // 1. Get webhook token
    const tokenRes = await request(app)
      .get("/api/tasks/webhook-token")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    const token = tokenRes.body.webhook_token;

    // 2. Post inbound webhook from external service (no cookies, no CSRF)
    const inboundRes = await request(app)
      .post(`/api/tasks/webhook/${token}`)
      .send({
        action: "create",
        title: "Review Q4 Tax Documents from External Pipeline",
        why: "Automated trigger from accounting pipeline",
        steps: ["Download 1099s", "Reconcile deductions"],
        priority: "high",
        kind: "budget",
        bucket: 7,
      })
      .expect(201);

    expect(inboundRes.body.success).toBe(true);
    expect(inboundRes.body.action).toBe("created");
    expect(inboundRes.body.task.title).toBe("Review Q4 Tax Documents from External Pipeline");
    expect(inboundRes.body.task.status).toBe("open");

    // 3. Verify task exists in user task list
    const tasksRes = await request(app)
      .get("/api/tasks?status=open")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    const created = tasksRes.body.tasks.find((t: any) =>
      t.title.includes("Review Q4 Tax Documents from External Pipeline")
    );
    expect(created).toBeDefined();
    expect(created.priority).toBe("high");
  });

  it("completes a task and auto-renews recurring instance via inbound webhook", async () => {
    // 1. Get token
    const tokenRes = await request(app)
      .get("/api/tasks/webhook-token")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    const token = tokenRes.body.webhook_token;

    // 2. Create recurring task in FinWise
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        title: "Quarterly Portfolio Rebalance Webhook Test",
        why: "Test recurring auto-renewal via webhook",
        priority: "medium",
        bucket: 30,
        recurrence: {
          cadence: "quarterly",
        },
      })
      .expect(201);

    const taskId = createRes.body.task._id;

    // 3. Complete task via external webhook
    const completeRes = await request(app)
      .post(`/api/tasks/webhook/${token}`)
      .send({
        action: "complete",
        taskId,
        note: "Completed via Linear issue close webhook",
      })
      .expect(200);

    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.action).toBe("completed");
    expect(completeRes.body.task.status).toBe("completed");
    expect(completeRes.body.next_task).toBeDefined();
    expect(completeRes.body.next_task.recurrence.generation).toBe(2);
    expect(completeRes.body.next_task.status).toBe("open");
  });

  it("dispatches selected tasks to an external webhook with Linear and Todoist formats", async () => {
    // 1. Create a task to dispatch
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        title: "Dispatch Me to Linear",
        why: "Ensure external sync works smoothly",
        priority: "high",
        bucket: 7,
      })
      .expect(201);

    const taskId = createRes.body.task._id;

    // 2. Mock global fetch for outbound webhook
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ received: true }),
    });
    globalThis.fetch = fetchMock;

    try {
      // 3. Dispatch to Linear target format
      const dispatchRes = await request(app)
        .post("/api/tasks/dispatch-webhook")
        .set("Cookie", [cookie, csrfCookie])
        .set("x-csrf-token", csrfToken)
        .set("X-Org-Id", orgId)
        .send({
          target: "linear",
          webhook_url: "https://api.linear.app/webhooks/mock",
          task_ids: [taskId],
        })
        .expect(200);

      expect(dispatchRes.body.success).toBe(true);
      expect(dispatchRes.body.delivery_status).toBe("delivered");
      expect(dispatchRes.body.target).toBe("linear");
      expect(dispatchRes.body.count).toBe(1);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.linear.app/webhooks/mock",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects inbound webhook with invalid token", async () => {
    await request(app)
      .post("/api/tasks/webhook/non_existent_token_1234567890")
      .send({ action: "create", title: "Test" })
      .expect(404);
  });
});
