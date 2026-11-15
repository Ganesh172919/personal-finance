import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

describe("Finance OS Multi-Currency FX Budgets, Envelopes & Forecast", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    await BudgetAllocationModel.init();
    await AccountModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("normalizes a native INR allocation and invalidates a previously read envelope", async () => {
    const auth = await createAuthedUser();
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const headers = [auth.cookie, csrf.headers["set-cookie"]?.[0]?.split(";")[0] || ""];
    const period = monthKey(new Date());
    const path = `/api/finance/budgets/${period}`;
    const envelopes = () => request(app).get(`${path}/envelopes?currency=INR`).set("Cookie", headers);

    await envelopes().expect(200).expect(response => expect(response.body.totals.planned).toBe(0));
    await request(app).put(`${path}/allocations`).set("Cookie", headers).set("x-csrf-token", csrf.body.csrf_token)
      .send({ category: "Food & Dining", amount: 835, currency: "INR" }).expect(200);

    await envelopes().expect(200).expect(response => expect(response.body.envelopes[0]).toMatchObject({
      category: "Food & Dining", planned: 835, remaining: 835, currency: "INR",
    }));
    await request(app).get(`${path}/allocations?currency=USD`).set("Cookie", headers)
      .expect(200).expect(response => expect(response.body.allocations[0]).toMatchObject({ amount: 10, currency: "USD" }));
    await request(app).get(`${path}/allocations`).set("Cookie", headers)
      .expect(200).expect(response => expect(response.body.allocations[0]).toMatchObject({ amount: 835, currency: "INR" }));
  });

  it("converts budget allocations and envelopes across global currencies (EUR, GBP, JPY, INR) with tenant isolation", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Get CSRF token
    const csrfRes = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrfRes.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrfRes.body.csrf_token as string;

    const now = new Date();
    const currentPeriod = monthKey(now);

    // Create a liquidity checking account with $10,000 opening balance
    const account = await AccountModel.create({
      orgId,
      name: "Main Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 10000,
      currentBalance: 10000,
      status: "active",
    });

    // 1. Create budget allocations in base USD: Housing $2000, Groceries $600
    await BudgetAllocationModel.create([
      {
        orgId,
        periodKey: currentPeriod,
        category: "Housing",
        amount: 2000,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
      {
        orgId,
        periodKey: currentPeriod,
        category: "Groceries",
        amount: 600,
        currency: "USD",
        createdByUserId: auth.user._id,
      },
    ]);

    // 2. Create actual transactions in base USD
    // Income: $5000 salary
    // Expense: Housing $2000, Groceries $300, Dining Out $150 (unbudgeted)
    await TransactionModel.create([
      {
        orgId,
        accountId: account._id,
        userId: auth.user._id,
        amount: 5000,
        type: "income",
        category: "Salary",
        description: "Monthly payroll",
        date: now,
      },
      {
        orgId,
        accountId: account._id,
        userId: auth.user._id,
        amount: -2000,
        type: "expense",
        category: "Housing",
        description: "Monthly Rent",
        date: now,
      },
      {
        orgId,
        accountId: account._id,
        userId: auth.user._id,
        amount: -300,
        type: "expense",
        category: "Groceries",
        description: "Supermarket trips",
        date: now,
      },
      {
        orgId,
        accountId: account._id,
        userId: auth.user._id,
        amount: -150,
        type: "expense",
        category: "Dining Out",
        description: "Weekend Restaurant",
        date: now,
      },
    ]);

    // Test A: Default allocations (base currency, no FX params)
    const defaultAllocRes = await request(app)
      .get(`/api/finance/budgets/${currentPeriod}/allocations`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .expect(200);

    expect(defaultAllocRes.body.allocations).toHaveLength(2);
    expect(defaultAllocRes.body.currency).toBeUndefined();
    const housingDefault = defaultAllocRes.body.allocations.find((a: any) => a.category === "Housing");
    expect(housingDefault.amount).toBe(2000);
    expect(housingDefault.currency).toBe("USD");

    // Test B: Converted allocations to EUR (rate 0.92)
    const eurAllocRes = await request(app)
      .get(`/api/finance/budgets/${currentPeriod}/allocations?currency=EUR`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .expect(200);

    expect(eurAllocRes.body.currency).toBe("EUR");
    expect(eurAllocRes.body.fx_rate).toBe(0.92);
    expect(eurAllocRes.body.currency_symbol).toBe("€");
    const housingEur = eurAllocRes.body.allocations.find((a: any) => a.category === "Housing");
    // 2000 * 0.92 = 1840
    expect(housingEur.amount).toBe(1840);
    expect(housingEur.currency).toBe("EUR");
    const groceriesEur = eurAllocRes.body.allocations.find((a: any) => a.category === "Groceries");
    // 600 * 0.92 = 552
    expect(groceriesEur.amount).toBe(552);

    // Test C: Converted allocations to JPY (rate 155, rounded integer)
    const jpyAllocRes = await request(app)
      .get(`/api/finance/budgets/${currentPeriod}/allocations?currency=JPY`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .expect(200);

    expect(jpyAllocRes.body.currency).toBe("JPY");
    expect(jpyAllocRes.body.fx_rate).toBe(155);
    expect(jpyAllocRes.body.currency_symbol).toBe("¥");
    const housingJpy = jpyAllocRes.body.allocations.find((a: any) => a.category === "Housing");
    // 2000 * 155 = 310,000
    expect(housingJpy.amount).toBe(310000);

    // Test D: Budget Envelopes in GBP (rate 0.78)
    const gbpEnvRes = await request(app)
      .get(`/api/finance/budgets/${currentPeriod}/envelopes?currency=GBP`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .expect(200);

    expect(gbpEnvRes.body.currency).toBe("GBP");
    expect(gbpEnvRes.body.fx_rate).toBe(0.78);
    expect(gbpEnvRes.body.currency_symbol).toBe("£");
    // Planned: (2000 + 600) * 0.78 = 2600 * 0.78 = 2028
    expect(gbpEnvRes.body.totals.planned).toBe(2028);
    // Spent: (2000 + 300 + 150) * 0.78 = 2450 * 0.78 = 1911
    expect(gbpEnvRes.body.totals.spent).toBe(1911);
    // Remaining: 2028 - 1911 = 117
    expect(gbpEnvRes.body.totals.remaining).toBe(117);

    // Groceries envelope: planned 600 * 0.78 = 468, spent 300 * 0.78 = 234, remaining 234
    const groceriesGbp = gbpEnvRes.body.envelopes.find((e: any) => e.category === "Groceries");
    expect(groceriesGbp.planned).toBe(468);
    expect(groceriesGbp.spent).toBe(234);
    expect(groceriesGbp.remaining).toBe(234);
    expect(groceriesGbp.currency).toBe("GBP");

    // Test E: Forecast in INR (rate 83.5)
    const inrForecastRes = await request(app)
      .get(`/api/finance/forecast?period_key=${currentPeriod}&months=3&currency=INR`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(orgId))
      .expect(200);

    expect(inrForecastRes.body.currency).toBe("INR");
    expect(inrForecastRes.body.fx_rate).toBe(83.5);
    expect(inrForecastRes.body.currency_symbol).toBe("₹");
    expect(inrForecastRes.body.projection).toHaveLength(3);
    // Liquidity balance was 10000 + 5000 - 2450 = 12550 USD -> converted to INR: 12550 * 83.5 = 1,047,925
    expect(inrForecastRes.body.cashflow_health.liquidity_balance).toBe(1047925);

    // Test F: Tenant isolation with another user
    const intruderAuth = await createAuthedUser();
    const intruderMembership = await ensurePersonalOrgForUser(intruderAuth.user._id);

    const intruderRes = await request(app)
      .get(`/api/finance/budgets/${currentPeriod}/allocations?currency=EUR`)
      .set("Cookie", [intruderAuth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", String(intruderMembership.orgId))
      .expect(200);

    // Intruder org has 0 allocations
    expect(intruderRes.body.allocations).toHaveLength(0);
  });
});
