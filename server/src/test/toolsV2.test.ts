import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import EntitlementModel from "../models/entitlementModel";
import MerchantModel from "../models/merchantModel";
import MonthCloseModel from "../models/monthCloseModel";
import NotificationModel from "../models/notificationModel";
import RecurringRuleModel from "../models/recurringRuleModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("v2 tool handlers", () => {
  const app = createApp();
  const token = "internal-tools-token-test-123456";
  const prevToken = process.env.AI_CORE_TOOLS_TOKEN;

  let cookie = "";
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    process.env.AI_CORE_TOOLS_TOKEN = token;
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    process.env.AI_CORE_TOOLS_TOKEN = prevToken;
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    userId = auth.user._id.toString();
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);

    await EntitlementModel.create({
      orgId: new mongoose.Types.ObjectId(orgId),
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });
  });

  it("supports finance lookup tools", async () => {
    await AccountModel.create({
      orgId,
      name: "Chase Checking",
      institution: "Chase",
      type: "checking",
      currency: "USD",
      status: "active",
      metadata: {},
    } as any);

    await MerchantModel.create({
      orgId,
      name: "Netflix",
      normalizedName: "netflix",
      aliases: ["NETFLIX.COM"],
      metadata: {},
    } as any);

    await RecurringRuleModel.create({
      orgId,
      createdByUserId: userId,
      status: "active",
      name: "Rent",
      cron: "0 9 1 * *",
      category: "Housing",
      amountMin: 900,
      amountMax: 1200,
      metadata: {},
    } as any);

    const lookupAccount = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        tool_call: {
          id: "tc_lookup_account",
          title: "Lookup account",
          description: "lookup",
          requires_confirmation: false,
          risk: "low",
          tool: "finance.lookupAccount",
          args: { q: "chase", limit: 5 },
        },
      })
      .expect(200);

    expect(lookupAccount.body.ok).toBe(true);
    expect(Array.isArray(lookupAccount.body.preview?.matches)).toBe(true);
    expect(lookupAccount.body.preview?.matches?.some((m: any) => String(m.name).includes("Chase"))).toBe(true);

    const lookupMerchant = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        tool_call: {
          id: "tc_lookup_merchant",
          title: "Lookup merchant",
          description: "lookup",
          requires_confirmation: false,
          risk: "low",
          tool: "finance.lookupMerchant",
          args: { q: "netflix", limit: 5 },
        },
      })
      .expect(200);

    expect(lookupMerchant.body.ok).toBe(true);
    expect(lookupMerchant.body.preview?.matches?.some((m: any) => String(m.name).toLowerCase().includes("netflix"))).toBe(true);

    const lookupRule = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        tool_call: {
          id: "tc_lookup_rule",
          title: "Lookup recurring rule",
          description: "lookup",
          requires_confirmation: false,
          risk: "low",
          tool: "finance.lookupRecurringRule",
          args: { q: "rent", limit: 5 },
        },
      })
      .expect(200);

    expect(lookupRule.body.ok).toBe(true);
    expect(lookupRule.body.preview?.matches?.some((m: any) => String(m.name).toLowerCase().includes("rent"))).toBe(true);
  });

  it("detects recurring candidates via tool", async () => {
    const now = new Date();
    const month0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0));
    const dates = [0, 1, 2, 3].map((delta) => new Date(Date.UTC(month0.getUTCFullYear(), month0.getUTCMonth() - delta, 1, 12, 0, 0)));

    for (const date of dates) {
      await TransactionModel.create({
        orgId,
        userId,
        amount: -15,
        category: "Subscriptions",
        description: "Netflix",
        date,
        type: "expense",
      } as any);
    }

    const sim = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        tool_call: {
          id: "tc_detect_recurring",
          title: "Detect recurring candidates",
          description: "detect",
          requires_confirmation: false,
          risk: "low",
          tool: "finance.detectRecurringCandidates",
          args: { days_back: 365, limit: 10, min_occurrences: 3 },
        },
      })
      .expect(200);

    expect(sim.body.ok).toBe(true);
    expect(Array.isArray(sim.body.preview?.candidates)).toBe(true);
    expect((sim.body.preview?.candidates as any[]).some((c) => String(c.description_sample || "").toLowerCase().includes("netflix"))).toBe(true);
  });

  it("recommends and applies budget allocations", async () => {
    const periodKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    const txDate = new Date();

    await TransactionModel.create({ orgId, userId, amount: -120, category: "Dining Out", description: "Lunch", date: txDate, type: "expense" } as any);
    await TransactionModel.create({ orgId, userId, amount: -900, category: "Rent", description: "Rent", date: txDate, type: "expense" } as any);
    await TransactionModel.create({ orgId, userId, amount: -60, category: "Subscriptions", description: "Netflix", date: txDate, type: "expense" } as any);

    const sim = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        tool_call: {
          id: "tc_budget_reco",
          title: "Recommend allocations",
          description: "recommend budgets",
          requires_confirmation: true,
          risk: "low",
          tool: "budgets.recommendAllocations",
          args: { period_key: periodKey, days_back: 90, top_categories: 5, buffer_pct: 0 },
        },
      })
      .expect(200);

    expect(sim.body.ok).toBe(true);
    expect(Array.isArray(sim.body.preview?.recommendations)).toBe(true);
    expect(sim.body.preview?.recommendations?.length).toBeGreaterThan(0);

    const exec = await request(app)
      .post("/api/internal/tools/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        confirm: true,
        tool_call: {
          id: "tc_budget_reco",
          title: "Recommend allocations",
          description: "recommend budgets",
          requires_confirmation: true,
          risk: "low",
          tool: "budgets.recommendAllocations",
          args: { period_key: periodKey, days_back: 90, top_categories: 5, buffer_pct: 0 },
        },
      })
      .expect(200);

    expect(exec.body.ok).toBe(true);
    expect(exec.body.result?.applied).toBe(true);

    const rows = await BudgetAllocationModel.find({ orgId: new mongoose.Types.ObjectId(orgId), periodKey }).lean();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("closes the month and optionally creates an export job", async () => {
    const now = new Date();
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2, 12, 0, 0));

    await TransactionModel.create({ orgId, userId, amount: 3000, category: "Income", description: "Paycheck", date: monthStart, type: "income" } as any);
    await TransactionModel.create({ orgId, userId, amount: -1200, category: "Rent", description: "Rent", date: monthStart, type: "expense" } as any);

    const exec = await request(app)
      .post("/api/internal/tools/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        confirm: true,
        tool_call: {
          id: "tc_close_month",
          title: "Close month",
          description: "close",
          requires_confirmation: true,
          risk: "medium",
          tool: "closeMonth.run",
          args: { period_key: periodKey, include_export: false, top_categories: 5 },
        },
      })
      .expect(200);

    expect(exec.body.ok).toBe(true);
    expect(exec.body.result?.month_close?.period_key).toBe(periodKey);

    const close = await MonthCloseModel.findOne({ orgId: new mongoose.Types.ObjectId(orgId), periodKey }).lean();
    expect(close).toBeTruthy();
  });

  it("sends an in-app notification via tool", async () => {
    const exec = await request(app)
      .post("/api/internal/tools/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        org_id: orgId,
        user_id: userId,
        confirm: true,
        tool_call: {
          id: "tc_notify_inapp",
          title: "Notify",
          description: "notify",
          requires_confirmation: true,
          risk: "low",
          tool: "notifications.send",
          args: { channel: "in_app", subject: "Hello", message: "Test in-app notification" },
        },
      })
      .expect(200);

    expect(exec.body.ok).toBe(true);
    expect(exec.body.result?.sent).toBe(true);
    expect(exec.body.result?.channel).toBe("in_app");

    const notifications = await NotificationModel.find({ orgId: new mongoose.Types.ObjectId(orgId) }).lean();
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.status).toBe("unread");
  });

  it("lists notifications via v1 API", async () => {
    await NotificationModel.create({
      orgId,
      userId,
      status: "unread",
      title: "Test",
      message: "Message",
      metadata: {},
    } as any);

    const res = await request(app)
      .get("/api/v1/notifications?status=unread&limit=10")
      .set("Cookie", cookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body.notifications.length).toBe(1);
    expect(res.body.notifications[0]?.status).toBe("unread");
  });
});

