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

    // Personal spending must not be turned into unsourced peer statistics.
    expect(res.body).toHaveProperty("peer_benchmarks");
    expect(res.body).toHaveProperty("peer_benchmarking_summary");
    const peerBenchmarks = res.body.peer_benchmarks;
    expect(Array.isArray(peerBenchmarks)).toBe(true);
    expect(peerBenchmarks).toEqual([]);

    const peerSummary = res.body.peer_benchmarking_summary;
    expect(peerSummary).toBeDefined();
    expect(peerSummary.available).toBe(false);
    expect(peerSummary.unavailable_reason).toContain("No verified peer comparison data");
    expect(peerSummary.cohort_name).toBeNull();
    expect(peerSummary.alignment_index).toBeNull();
    expect(peerSummary.frugal_categories_count).toBeNull();
    expect(peerSummary.elevated_categories_count).toBeNull();

    // Auto-Rebalance Plan (Batch 37)
    expect(res.body).toHaveProperty("auto_rebalance_plan");
    const rebalancePlan = res.body.auto_rebalance_plan;
    expect(rebalancePlan).toBeDefined();
    expect(rebalancePlan.period_key).toBe(currentPeriod);
    expect(rebalancePlan.budget_preserved).toBe(true);
    expect(Array.isArray(rebalancePlan.transfers)).toBe(true);
    expect(Array.isArray(rebalancePlan.proposed_allocations)).toBe(true);
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
    expect(res.body.peer_benchmarks).toEqual([]);
    expect(res.body.peer_benchmarking_summary).toMatchObject({
      available: false,
      cohort_name: null,
      alignment_index: null,
      frugal_categories_count: null,
      elevated_categories_count: null,
    });
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
    expect(debtRec.impact_monthly_savings).toBeNull();
    expect(debtRec.score_impact_pts).toBeNull();
    expect(debtRec.reasoning).toContain("$4500.00 at 22.5% APR");
    expect(debtRec.reasoning).toContain("about $84.38 in monthly interest");
    expect(debtRec.reasoning).toContain("savings and health-score changes have not been calculated");
    expect(debtRec.reasoning).not.toContain("quarterly");
    expect(debtRec.suggested_task_title).not.toContain("$50");
    expect(debtRec.action_type).toBe("create_task");
    expect(res.body.savings_potential_summary.total_monthly_savings).toBe(0);
    expect(res.body.savings_potential_summary.potential_score_improvement).toBe(0);
  });

  it.each([
    ["zero", 0],
    ["missing", undefined],
    ["null", null],
    ["negative", -3],
  ])("does not invent a high-interest recommendation for %s APR", async (_label, apr) => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const FinancialProfileModel = (await import("../models/financialProfileModel")).default;
    await FinancialProfileModel.findOneAndUpdate(
      { orgId, userId: auth.user._id },
      { debts: [{ name: "Saved debt", balance: 1000, interest_rate: apr, minimum_payment: 25, type: "loan" }] },
      { upsert: true }
    );

    const res = await request(app)
      .get("/api/budget-health")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.proactive_savings_recommendations).toEqual([]);
    expect(res.body.savings_potential_summary.total_monthly_savings).toBe(0);
  });

  it("uses the active debt facts without imposing a minimum savings amount", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const FinancialProfileModel = (await import("../models/financialProfileModel")).default;
    await FinancialProfileModel.findOneAndUpdate(
      { orgId, userId: auth.user._id },
      { debts: [
        { name: "Paid off", balance: 0, interest_rate: 30, minimum_payment: 0, type: "credit_card" },
        { name: "Small balance", balance: 1, interest_rate: 24, minimum_payment: 1, type: "credit_card" },
      ] },
      { upsert: true }
    );

    const res = await request(app)
      .get("/api/budget-health")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    const debtRec = res.body.proactive_savings_recommendations.find((rec: any) => rec.category === "Debt Paydown");
    expect(debtRec.title).toContain("Small balance");
    expect(debtRec.reasoning).toContain("about $0.02 in monthly interest");
    expect(debtRec.impact_monthly_savings).toBeNull();
    expect(debtRec.score_impact_pts).toBeNull();
    expect(res.body.savings_potential_summary.total_monthly_savings).toBe(0);
  });

  it("executes POST /api/finance/budgets/:periodKey/rebalance preserving total planned budget across envelopes", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    const periodKey = "2026-10";

    // Setup initial allocations: Groceries: $600, Dining Out: $400, Total = $1000
    await BudgetAllocationModel.create([
      {
        orgId,
        periodKey,
        category: "Groceries",
        amount: 600,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
      {
        orgId,
        periodKey,
        category: "Dining Out",
        amount: 400,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
    ]);

    // Rebalance $100 from Groceries (surplus) to Dining Out (deficit)
    const rebalanceRes = await request(app)
      .post(`/api/finance/budgets/${periodKey}/rebalance`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .send({
        transfers: [
          {
            from_category: "Groceries",
            to_category: "Dining Out",
            amount: 100,
            reason: "Transfer $100 surplus to buffer overrun",
          },
        ],
      });

    expect(rebalanceRes.status).toBe(200);
    expect(rebalanceRes.body.period_key).toBe(periodKey);
    expect(rebalanceRes.body.transfers_applied).toBe(1);
    expect(rebalanceRes.body.total_rebalanced_amount).toBe(100);
    expect(rebalanceRes.body.budget_preserved).toBe(true);

    // Verify allocations in database
    const allocations = await BudgetAllocationModel.find({ orgId, periodKey }).lean();
    const groceries = allocations.find((a) => a.category === "Groceries");
    const dining = allocations.find((a) => a.category === "Dining Out");

    expect(groceries?.amount).toBe(500); // 600 - 100
    expect(dining?.amount).toBe(500);    // 400 + 100

    const totalPlanned = allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(totalPlanned).toBe(1000); // Mathematical invariance preserved!
  });

  it("rejects invalid rebalancing requests with 400", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    // Empty transfers
    const res1 = await request(app)
      .post("/api/finance/budgets/2026-10/rebalance")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .send({ transfers: [] });

    expect(res1.status).toBe(400);

    // Non-positive amount
    const res2 = await request(app)
      .post("/api/finance/budgets/2026-10/rebalance")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .send({
        transfers: [
          { from_category: "Groceries", to_category: "Dining Out", amount: -50 },
        ],
      });

    expect(res2.status).toBe(400);
  });
});
