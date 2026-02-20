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
      .post("/api/v1/workflows")
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
      .post(`/api/v1/workflows/${workflowId}/run`)
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
      .post("/api/v1/workflows")
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
      .post(`/api/v1/workflows/${workflowId}/run`)
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
      .get(`/api/v1/exports/${exportId}/download`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(String(download.headers["content-type"] || "")).toContain("text/csv");
    expect(download.text).toContain("Utilities");
    expect(download.text).toContain("Internet bill");
  }, 20_000);
});
