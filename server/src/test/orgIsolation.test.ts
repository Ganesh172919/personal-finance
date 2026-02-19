import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import OrgMemberModel from "../models/orgMemberModel";
import OrganizationModel from "../models/organizationModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("org isolation across key endpoints", () => {
  const app = createApp();
  let cookie = "";
  let userId = "";
  let orgAId = "";
  let orgBId = "";
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
    userId = auth.user._id.toString();

    const personal = await ensurePersonalOrgForUser(auth.user._id);
    orgAId = String(personal.orgId);

    const orgB = await OrganizationModel.create({
      name: "Second Org",
      slug: "second-org",
      type: "team",
      createdByUserId: auth.user._id,
    });
    orgBId = orgB._id.toString();

    await OrgMemberModel.create({
      orgId: orgB._id,
      userId: auth.user._id,
      role: "owner",
      status: "active",
      isDefault: false,
    });

    await Promise.all([
      EntitlementModel.create({ orgId: orgAId, userId, plan: "pro", status: "active" }),
      EntitlementModel.create({ orgId: orgBId, userId, plan: "pro", status: "active" }),
    ]);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("keeps transactions, dashboard, exports, chat, and AI outputs scoped by X-Org-Id", async () => {
    const now = new Date().toISOString().slice(0, 10);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 100,
        category: "Groceries",
        description: "Org A expense",
        type: "expense",
        date: now,
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .send({
        amount: 300,
        category: "Travel",
        description: "Org B expense",
        type: "expense",
        date: now,
      })
      .expect(201);

    const txOrgA = await request(app)
      .get("/api/transactions?limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const txOrgB = await request(app)
      .get("/api/transactions?limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect(txOrgA.body.transactions).toHaveLength(1);
    expect(txOrgB.body.transactions).toHaveLength(1);
    expect(txOrgA.body.transactions[0].description).toBe("Org A expense");
    expect(txOrgB.body.transactions[0].description).toBe("Org B expense");

    const dashboardA = await request(app)
      .get("/api/dashboard/summary")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);
    const dashboardB = await request(app)
      .get("/api/dashboard/summary")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect(Number(dashboardA.body.spending.current_month_total)).toBe(100);
    expect(Number(dashboardB.body.spending.current_month_total)).toBe(300);

    const exportA = await request(app)
      .post("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ type: "transactions_csv", params: {} })
      .expect(201);

    const exportB = await request(app)
      .post("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .send({ type: "transactions_csv", params: {} })
      .expect(201);

    const exportsA = await request(app)
      .get("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);
    const exportsB = await request(app)
      .get("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect((exportsA.body.exports as Array<any>).some((row) => row.id === exportA.body.export.id)).toBe(true);
    expect((exportsA.body.exports as Array<any>).some((row) => row.id === exportB.body.export.id)).toBe(false);
    expect((exportsB.body.exports as Array<any>).some((row) => row.id === exportB.body.export.id)).toBe(true);
    expect((exportsB.body.exports as Array<any>).some((row) => row.id === exportA.body.export.id)).toBe(false);

    const chatA = await request(app)
      .post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(201);

    const chatB = await request(app)
      .post("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .send({})
      .expect(201);

    const chatListA = await request(app)
      .get("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);
    const chatListB = await request(app)
      .get("/api/chat/sessions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect((chatListA.body.sessions as Array<any>).some((row) => row.id === chatA.body.id)).toBe(true);
    expect((chatListA.body.sessions as Array<any>).some((row) => row.id === chatB.body.id)).toBe(false);
    expect((chatListB.body.sessions as Array<any>).some((row) => row.id === chatB.body.id)).toBe(true);
    expect((chatListB.body.sessions as Array<any>).some((row) => row.id === chatA.body.id)).toBe(false);

    await request(app)
      .post("/api/process-command")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ command: "Summarize my finances", options: { narrative: false } })
      .expect(200);

    await request(app)
      .post("/api/process-command")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .send({ command: "Summarize my finances for org B", options: { narrative: false } })
      .expect(200);

    const insightsA = await request(app)
      .get("/api/agent-outputs/recent?limit=20")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const insightsB = await request(app)
      .get("/api/agent-outputs/recent?limit=20")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect((insightsA.body.outputs as Array<any>).length).toBeGreaterThan(0);
    expect((insightsB.body.outputs as Array<any>).length).toBeGreaterThan(0);
    expect(
      (insightsA.body.outputs as Array<any>).every((row) => mongoose.Types.ObjectId.isValid(String(row.id)))
    ).toBe(true);
    expect(
      (insightsB.body.outputs as Array<any>).every((row) => mongoose.Types.ObjectId.isValid(String(row.id)))
    ).toBe(true);

    // Tasks scoped by org
    await request(app)
      .post("/api/tasks/from-plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        plan: {
          executive_summary: "Org A plan",
          key_metrics: {},
          actions: {
            next_7_days: [
              {
                title: "Org A task",
                why: "Org A only",
                steps: ["step 1"],
                priority: "high",
                expected_impact: "test",
              },
            ],
            next_30_days: [],
            next_12_months: [],
          },
          assumptions: [],
          data_warnings: [],
        },
      })
      .expect(201);

    await request(app)
      .post("/api/tasks/from-plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .send({
        plan: {
          executive_summary: "Org B plan",
          key_metrics: {},
          actions: {
            next_7_days: [
              {
                title: "Org B task",
                why: "Org B only",
                steps: ["step 1"],
                priority: "high",
                expected_impact: "test",
              },
            ],
            next_30_days: [],
            next_12_months: [],
          },
          assumptions: [],
          data_warnings: [],
        },
      })
      .expect(201);

    const tasksA = await request(app)
      .get("/api/tasks?status=open&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const tasksB = await request(app)
      .get("/api/tasks?status=open&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect((tasksA.body.tasks as Array<any>).some((t) => t.title === "Org A task")).toBe(true);
    expect((tasksA.body.tasks as Array<any>).some((t) => t.title === "Org B task")).toBe(false);
    expect((tasksB.body.tasks as Array<any>).some((t) => t.title === "Org B task")).toBe(true);
    expect((tasksB.body.tasks as Array<any>).some((t) => t.title === "Org A task")).toBe(false);

    // Receipts scoped by org
    const receiptAParse = await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .attach("file", Buffer.from("test"), { filename: "receipt-a.jpg", contentType: "image/jpeg" })
      .expect(200);

    const receiptBParse = await request(app)
      .post("/api/receipts/parse")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgBId)
      .attach("file", Buffer.from("test"), { filename: "receipt-b.jpg", contentType: "image/jpeg" })
      .expect(200);

    const receiptsA = await request(app)
      .get("/api/receipts?page=1&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const receiptsB = await request(app)
      .get("/api/receipts?page=1&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", orgBId)
      .expect(200);

    expect(receiptsA.body.receipts).toHaveLength(1);
    expect(receiptsB.body.receipts).toHaveLength(1);
    expect(String(receiptsA.body.receipts[0].id)).toBe(String(receiptAParse.body.receipt_id));
    expect(String(receiptsB.body.receipts[0].id)).toBe(String(receiptBParse.body.receipt_id));
    expect(String(receiptsA.body.receipts[0].id)).not.toBe(String(receiptBParse.body.receipt_id));
  }, 40_000);
});
