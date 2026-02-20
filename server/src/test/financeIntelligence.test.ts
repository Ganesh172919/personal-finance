import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import RecurringRuleModel from "../models/recurringRuleModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const currentPeriodKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

describe("finance intelligence endpoints", () => {
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

    const membership = await ensurePersonalOrgForUser(auth.user._id);
    orgId = String((membership as any).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("returns budget envelopes with spent and remaining", async () => {
    const periodKey = currentPeriodKey();
    const now = new Date();
    const txDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 6, 12, 0, 0));

    await BudgetAllocationModel.create({
      orgId,
      periodKey,
      category: "Dining Out",
      amount: 100,
      currency: "USD",
      createdByUserId: userId,
      updatedByUserId: userId,
      metadata: { source: "test" },
    } as any);

    await BudgetAllocationModel.create({
      orgId,
      periodKey,
      category: "Rent",
      amount: 1000,
      currency: "USD",
      createdByUserId: userId,
      updatedByUserId: userId,
      metadata: { source: "test" },
    } as any);

    await TransactionModel.create({
      orgId,
      userId,
      amount: -120,
      category: "Dining Out",
      description: "Lunch",
      date: txDate,
      type: "expense",
    } as any);

    await TransactionModel.create({
      orgId,
      userId,
      amount: -900,
      category: "Rent",
      description: "Rent payment",
      date: txDate,
      type: "expense",
    } as any);

    await TransactionModel.create({
      orgId,
      userId,
      amount: -50,
      category: "Unbudgeted",
      description: "Surprise",
      date: txDate,
      type: "expense",
    } as any);

    const res = await request(app)
      .get(`/api/v1/finance/budgets/${periodKey}/envelopes`)
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(res.body.period_key).toBe(periodKey);
    expect(Array.isArray(res.body.envelopes)).toBe(true);

    const byCategory = new Map<string, any>((res.body.envelopes as any[]).map((row: any) => [row.category, row] as const));
    expect(byCategory.get("Dining Out")?.planned).toBe(100);
    expect(byCategory.get("Dining Out")?.spent).toBe(120);
    expect(byCategory.get("Dining Out")?.remaining).toBe(-20);

    expect(byCategory.get("Rent")?.planned).toBe(1000);
    expect(byCategory.get("Rent")?.spent).toBe(900);
    expect(byCategory.get("Rent")?.remaining).toBe(100);

    expect(byCategory.get("Unbudgeted")?.unbudgeted).toBe(true);
    expect(byCategory.get("Unbudgeted")?.planned).toBe(0);
    expect(byCategory.get("Unbudgeted")?.spent).toBe(50);
  });

  it("detects recurring candidates from transactions", async () => {
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

    const res = await request(app)
      .get("/api/v1/finance/recurring/candidates?days_back=365&limit=10")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(Array.isArray(res.body.candidates)).toBe(true);
    const found = (res.body.candidates as any[]).find((c) => String(c.description_sample || "").toLowerCase().includes("netflix"));
    expect(found).toBeTruthy();
    expect(found.cadence).toBe("monthly");
    expect(found.suggested_rule?.cron).toMatch(/^0 9 \d{1,2} \* \*$/);
  });

  it("returns a baseline forecast projection", async () => {
    const now = new Date();
    const start = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await TransactionModel.create({
      orgId,
      userId,
      amount: 3000,
      category: "Salary",
      description: "Paycheck",
      date: start,
      type: "income",
    } as any);

    await TransactionModel.create({
      orgId,
      userId,
      amount: -1200,
      category: "Rent",
      description: "Rent",
      date: start,
      type: "expense",
    } as any);

    await RecurringRuleModel.create({
      orgId,
      createdByUserId: userId,
      status: "active",
      name: "Netflix subscription",
      cron: "0 9 1 * *",
      merchantName: "Netflix",
      category: "Subscriptions",
      amountMin: 12,
      amountMax: 18,
      metadata: { source: "test" },
    } as any);

    const periodKey = currentPeriodKey();
    const res = await request(app)
      .get(`/api/v1/finance/forecast?period_key=${encodeURIComponent(periodKey)}&months=4&top_categories=5`)
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(res.body.period_key).toBe(periodKey);
    expect(res.body.months).toBe(4);
    expect(res.body.baseline.days_covered).toBe(90);
    expect(Array.isArray(res.body.projection)).toBe(true);
    expect(res.body.projection.length).toBe(4);
    expect(res.body.recurring_rules.active_rules).toBe(1);
    expect(res.body.recurring_rules.expense_expected_monthly).toBeGreaterThan(0);
  });
});
