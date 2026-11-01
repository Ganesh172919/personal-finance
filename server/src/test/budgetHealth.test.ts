import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

describe("Budget Health & Guardrails - Predictive Spending Limits", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    await BudgetAllocationModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("calculates predictive spending limits, safe daily allowance, and dynamically detects overshoot risk", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const now = new Date();
    const currentPeriod = monthKey(now);

    // Create 3 budget envelopes: Groceries (on track), Dining Out (accelerated burn), Utilities (exhausted)
    await BudgetAllocationModel.create([
      {
        orgId,
        periodKey: currentPeriod,
        category: "Groceries",
        amount: 600,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
      {
        orgId,
        periodKey: currentPeriod,
        category: "Dining Out",
        amount: 400,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
      {
        orgId,
        periodKey: currentPeriod,
        category: "Utilities",
        amount: 200,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
    ]);

    // Create spending transactions
    await TransactionModel.create([
      {
        orgId,
        userId: auth.user._id,
        amount: -10,
        type: "expense",
        category: "Groceries",
        description: "Weekly supermarket",
        date: now,
      },
      {
        orgId,
        userId: auth.user._id,
        amount: -350,
        type: "expense",
        category: "Dining Out",
        description: "Weekend dinners",
        date: now,
      },
      {
        orgId,
        userId: auth.user._id,
        amount: -250,
        type: "expense",
        category: "Utilities",
        description: "Electricity bill",
        date: now,
      },
    ]);

    const res = await request(app)
      .get("/api/budget-health")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("health_score");
    expect(res.body).toHaveProperty("predictive_spending_limits");
    expect(res.body).toHaveProperty("predictive_limits_summary");

    const limits = res.body.predictive_spending_limits;
    expect(Array.isArray(limits)).toBe(true);
    expect(limits.length).toBe(3);

    // Utilities is exhausted ($250 spent of $200 planned)
    const utilities = limits.find((l: any) => l.category === "Utilities");
    expect(utilities).toBeDefined();
    expect(utilities.planned).toBe(200);
    expect(utilities.spent).toBe(250);
    expect(utilities.remaining).toBe(-50);
    expect(utilities.safe_daily_spend).toBe(0);
    expect(utilities.recommended_cap).toBe(0);
    expect(utilities.overshoot_risk).toBe(true);
    expect(utilities.status).toBe("critical");

    // Dining Out has rapid burn ($350 spent of $400 planned)
    const dining = limits.find((l: any) => l.category === "Dining Out");
    expect(dining).toBeDefined();
    expect(dining.planned).toBe(400);
    expect(dining.spent).toBe(350);
    expect(dining.remaining).toBe(50);
    expect(dining.overshoot_risk).toBe(true);
    expect(dining.daily_reduction_required).toBeGreaterThan(0);
    expect(dining.status).toMatch(/critical|caution/);

    // Groceries is on track ($10 spent of $600 planned)
    const groceries = limits.find((l: any) => l.category === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries.planned).toBe(600);
    expect(groceries.spent).toBe(10);
    expect(groceries.remaining).toBe(590);
    expect(groceries.safe_daily_spend).toBeGreaterThan(0);
    expect(groceries.recommended_cap).toBe(590);
    expect(groceries.status).toBe("safe");

    // Verify priority sorting: critical comes first, then caution, then safe
    expect(limits[0].status).toBe("critical");
    const lastLimit = limits[limits.length - 1];
    expect(lastLimit.status).toBe("safe");

    // Summary assertions
    const summary = res.body.predictive_limits_summary;
    expect(summary).toBeDefined();
    expect(summary.days_remaining).toBeGreaterThanOrEqual(0);
    expect(summary.total_safe_daily_spend).toBeGreaterThan(0);
    expect(summary.categories_at_risk).toBeGreaterThanOrEqual(1);
    expect(summary.total_daily_reduction_required).toBeGreaterThan(0);

    // Proactive Savings Recommendations
    expect(res.body).toHaveProperty("proactive_savings_recommendations");
    expect(res.body).toHaveProperty("savings_potential_summary");

    const recommendations = res.body.proactive_savings_recommendations;
    expect(Array.isArray(recommendations)).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);

    const diningOrUtilsRec = recommendations.find(
      (r: any) => r.category === "Dining Out" || r.category === "Utilities"
    );
    expect(diningOrUtilsRec).toBeDefined();
    expect(diningOrUtilsRec.impact_monthly_savings).toBeGreaterThan(0);
    expect(diningOrUtilsRec.score_impact_pts).toBeGreaterThan(0);
    expect(diningOrUtilsRec.action_type).toBe("create_task");
    expect(diningOrUtilsRec.suggested_task_title).toBeDefined();

    const savingsSummary = res.body.savings_potential_summary;
    expect(savingsSummary.total_monthly_savings).toBeGreaterThan(0);
    expect(savingsSummary.potential_score_improvement).toBeGreaterThan(0);
    expect(savingsSummary.recommended_actions_count).toBe(recommendations.length);
  });

  it("returns clean empty predictive limits when no budgets are defined", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .get("/api/budget-health")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.predictive_spending_limits).toEqual([]);
    expect(res.body.predictive_limits_summary).toBeDefined();
    expect(res.body.predictive_limits_summary.categories_at_risk).toBe(0);
    expect(res.body.predictive_limits_summary.total_safe_daily_spend).toBe(0);
    expect(res.body.proactive_savings_recommendations).toEqual([]);
    expect(res.body.savings_potential_summary.total_monthly_savings).toBe(0);
  });

  it("generates proactive debt payoff acceleration recommendation when debts with high APR exist", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Seed profile with a high-interest credit card debt
    const FinancialProfileModel = (await import("../models/financialProfileModel")).default;
    await FinancialProfileModel.findOneAndUpdate(
      { orgId, userId: auth.user._id },
      {
        orgId,
        userId: auth.user._id,
        debts: [
          {
            name: "High APR Credit Card",
            balance: 4500,
            interest_rate: 22.5,
            minimum_payment: 120,
            type: "credit_card",
          },
        ],
      },
      { upsert: true, new: true }
    );

    const res = await request(app)
      .get("/api/budget-health")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    const recommendations = res.body.proactive_savings_recommendations;
    const debtRec = recommendations.find((r: any) => r.category === "Debt Paydown");
    expect(debtRec).toBeDefined();
    expect(debtRec.title).toContain("High APR Credit Card");
    expect(debtRec.difficulty).toBe("strategic");
    expect(debtRec.score_impact_pts).toBe(5);
    expect(debtRec.action_type).toBe("create_task");
  });
});
