import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Financial Command Center - Multi-Account Consolidated Netting", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("calculates multi-account consolidated netting across liquid, investment, and credit accounts", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Create checking, savings, brokerage, and credit accounts
    const checking = await AccountModel.create({
      orgId,
      name: "Primary Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    const savings = await AccountModel.create({
      orgId,
      name: "Emergency Fund",
      type: "savings",
      currency: "USD",
      openingBalance: 2000,
    });

    const brokerage = await AccountModel.create({
      orgId,
      name: "Index Brokerage",
      type: "brokerage",
      currency: "USD",
      openingBalance: 5000,
    });

    const credit = await AccountModel.create({
      orgId,
      name: "Rewards Card",
      type: "credit",
      currency: "USD",
      openingBalance: -500,
    });

    // Add recent transactions
    await TransactionModel.create([
      {
        orgId,
        userId: auth.user._id,
        accountId: checking._id,
        amount: 200,
        type: "income",
        category: "Salary",
        description: "Paycheck deposit",
        date: new Date(),
      },
      {
        orgId,
        userId: auth.user._id,
        accountId: checking._id,
        amount: -50,
        type: "expense",
        category: "Groceries",
        description: "Supermarket",
        date: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/command-center")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    expect(res.body.consolidated_netting).toBeDefined();
    const netting = res.body.consolidated_netting;

    // Checking: 1000 + 200 - 50 = 1150
    // Savings: 2000
    // Liquid assets: 1150 + 2000 = 3150
    expect(netting.liquid_assets).toBe(3150);
    expect(netting.investment_assets).toBe(5000);
    expect(netting.credit_liabilities).toBe(500);
    expect(netting.total_assets).toBe(8150);
    expect(netting.net_liquid_cash).toBe(2650); // 3150 - 500
    expect(netting.net_worth).toBe(7650); // 8150 - 500
    expect(netting.netting_status).toBe("surplus");
    expect(netting.account_breakdown).toHaveLength(4);

    // Cash runway reflects liquid balance and net liquid cash
    expect(res.body.cash_runway.liquid_balance).toBe(3150);
    expect(res.body.cash_runway.net_liquid_balance).toBe(2650);
  });

  it("detects credit deficit state and triggers act_now priority signal", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Liquid cash $1,000 vs credit card debt $3,500
    await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    await AccountModel.create({
      orgId,
      name: "Credit Card",
      type: "credit",
      currency: "USD",
      openingBalance: -3500,
    });

    const res = await request(app)
      .get("/api/command-center")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    const netting = res.body.consolidated_netting;
    expect(netting.liquid_assets).toBe(1000);
    expect(netting.credit_liabilities).toBe(3500);
    expect(netting.net_liquid_cash).toBe(-2500);
    expect(netting.netting_status).toBe("deficit");

    // Must emit act_now credit_deficit_netting priority signal
    const deficitSignal = res.body.priority_signals.find(
      (s: any) => s.id === "credit_deficit_netting"
    );
    expect(deficitSignal).toBeDefined();
    expect(deficitSignal.priority).toBe("act_now");
    expect(deficitSignal.metric).toBe(2500);
    expect(deficitSignal.action_href).toBe("/finance?tab=accounts");
  });

  it("detects high credit utilization (>50% of cash reserve) and triggers review_this_week signal", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Liquid cash $2,000 vs credit debt $1,500 (75% of cash)
    await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 2000,
    });

    await AccountModel.create({
      orgId,
      name: "Credit Card",
      type: "credit",
      currency: "USD",
      openingBalance: -1500,
    });

    const res = await request(app)
      .get("/api/command-center")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    const netting = res.body.consolidated_netting;
    expect(netting.net_liquid_cash).toBe(500);
    expect(netting.netting_status).toBe("surplus");

    const utilSignal = res.body.priority_signals.find(
      (s: any) => s.id === "high_credit_utilization_netting"
    );
    expect(utilSignal).toBeDefined();
    expect(utilSignal.priority).toBe("review_this_week");
    expect(utilSignal.metric).toBe(1500);
  });
});
