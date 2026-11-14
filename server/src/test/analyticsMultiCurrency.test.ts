import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import MerchantModel from "../models/merchantModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("analytics multi-currency FX localization & reporting", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("converts spending heatmap to EUR using fixed FX rate", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const account = await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    const now = new Date();
    await TransactionModel.create({
      orgId,
      userId: auth.user._id,
      accountId: account._id,
      amount: -100, // 100 USD expense
      type: "expense",
      category: "Food",
      description: "Dining",
      date: now,
    });

    // Request in EUR (FX rate is 0.92)
    const res = await request(app)
      .get("/api/analytics/spending-heatmap?days_back=30&currency=EUR")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("EUR");
    expect(res.body.fx_rate).toBe(0.92);
    expect(res.body.currency_symbol).toBe("€");
    expect(res.body.data.length).toBe(1);
    // 100 USD * 0.92 = 92 EUR
    expect(res.body.data[0].total).toBe(92);
  });

  it("converts category trends to JPY with integer rounding", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const account = await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    const now = new Date();
    await TransactionModel.create({
      orgId,
      userId: auth.user._id,
      accountId: account._id,
      amount: -10.50, // 10.50 USD
      type: "expense",
      category: "Software",
      description: "Subscription",
      date: now,
    });

    // Request in JPY (FX rate 155.0, integer rounded)
    // 10.50 * 155 = 1627.5 -> 1628 JPY
    const res = await request(app)
      .get("/api/analytics/category-trends?months=3&currency=JPY")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("JPY");
    expect(res.body.fx_rate).toBe(155.0);
    expect(res.body.currency_symbol).toBe("¥");
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].categories.Software).toBe(1628);
    expect(res.body.data[0].total).toBe(1628);
  });

  it("converts income vs expense summary to GBP", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const account = await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    const now = new Date();
    await TransactionModel.create([
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: 1000, // Income
        type: "income",
        category: "Salary",
        description: "Payroll",
        date: now,
      },
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -400, // Expense
        type: "expense",
        category: "Rent",
        description: "Apartment",
        date: now,
      },
    ]);

    // Request in GBP (FX rate 0.78)
    // Income: 1000 * 0.78 = 780 GBP
    // Expense: 400 * 0.78 = 312 GBP
    // Net: 780 - 312 = 468 GBP
    const res = await request(app)
      .get("/api/analytics/income-expense?months=3&currency=GBP")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("GBP");
    expect(res.body.fx_rate).toBe(0.78);
    expect(res.body.currency_symbol).toBe("£");
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].income).toBe(780);
    expect(res.body.data[0].expense).toBe(312);
    expect(res.body.data[0].net).toBe(468);
    expect(res.body.data[0].savings_rate).toBe(60);
  });

  it("converts account balances and calculates normalized net worth in INR", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await AccountModel.create([
      {
        orgId,
        name: "Checking",
        type: "checking",
        currency: "USD",
        openingBalance: 200,
      },
      {
        orgId,
        name: "Credit Card",
        type: "credit",
        currency: "USD",
        openingBalance: -50,
      },
    ]);

    // Request in INR (FX rate 83.5)
    // Assets: 200 USD * 83.5 = 16,700 INR
    // Liabilities: 50 USD * 83.5 = 4,175 INR
    // Net Worth: 16,700 - 4,175 = 12,525 INR
    const res = await request(app)
      .get("/api/analytics/account-balances?currency=INR")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("INR");
    expect(res.body.fx_rate).toBe(83.5);
    expect(res.body.currency_symbol).toBe("₹");
    expect(res.body.summary.total_assets).toBe(16700);
    expect(res.body.summary.total_liabilities).toBe(4175);
    expect(res.body.summary.net_worth).toBe(12525);
  });

  it("converts top merchants spend to CAD", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const account = await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });

    const merchant = await MerchantModel.create({
      orgId,
      name: "Target Stores",
      normalizedName: "target stores",
    });

    const now = new Date();
    await TransactionModel.create({
      orgId,
      userId: auth.user._id,
      accountId: account._id,
      merchantId: merchant._id,
      amount: -50, // 50 USD
      type: "expense",
      category: "Shopping",
      description: "Target Groceries",
      date: now,
    });

    // Request in CAD (FX rate 1.36)
    // 50 * 1.36 = 68 CAD
    const res = await request(app)
      .get("/api/analytics/top-merchants?limit=5&months=3&currency=CAD")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("CAD");
    expect(res.body.fx_rate).toBe(1.36);
    expect(res.body.currency_symbol).toBe("CA$");
    expect(res.body.merchants.length).toBe(1);
    expect(res.body.merchants[0].name).toBe("Target Stores");
    expect(res.body.merchants[0].total).toBe(68);
  });

  it("returns multi-currency summary and complete 7-currency conversion matrix", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await AccountModel.create({
      orgId,
      name: "Main Savings",
      type: "savings",
      currency: "USD",
      openingBalance: 1000, // 1000 USD Net Worth
    });

    const res = await request(app)
      .get("/api/analytics/multi-currency-summary?currency=EUR")
      .set("Cookie", auth.cookie)
      .set("x-org-id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body.base_currency).toBe("USD");
    expect(res.body.target_currency).toBe("EUR");
    expect(res.body.fx_rate).toBe(0.92);
    expect(res.body.currency_symbol).toBe("€");
    expect(res.body.base_summary.net_worth).toBe(1000);
    expect(res.body.converted_summary.net_worth).toBe(920);

    // Verify all 7 supported currencies exist in rates_table
    expect(res.body.rates_table.length).toBe(7);
    const inrRow = res.body.rates_table.find((r: any) => r.currency === "INR");
    expect(inrRow).toBeDefined();
    expect(inrRow.fx_rate).toBe(83.5);
    expect(inrRow.net_worth_localized).toBe(83500);

    const jpyRow = res.body.rates_table.find((r: any) => r.currency === "JPY");
    expect(jpyRow).toBeDefined();
    expect(jpyRow.fx_rate).toBe(155.0);
    expect(jpyRow.net_worth_localized).toBe(155000);
  });
});
