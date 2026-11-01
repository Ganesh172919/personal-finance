import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("analytics spending heatmap", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("aggregates daily expenses and excludes income and older records", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const account = await AccountModel.create({
      orgId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      openingBalance: 5000,
    });

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const longAgo = new Date(now);
    longAgo.setDate(longAgo.getDate() - 400);

    await TransactionModel.create([
      // Today: two expenses
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -45.50,
        type: "expense",
        category: "Food",
        description: "Lunch",
        date: now,
      },
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -15.25,
        type: "expense",
        category: "Transport",
        description: "Bus",
        date: now,
      },
      // Today: income (should NOT be in spending heatmap)
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: 2500,
        type: "income",
        category: "Salary",
        description: "Paycheck",
        date: now,
      },
      // Yesterday: one expense
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -80,
        type: "expense",
        category: "Utilities",
        description: "Electric",
        date: yesterday,
      },
      // 60 days ago: one expense
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -120,
        type: "expense",
        category: "Shopping",
        description: "Clothes",
        date: twoMonthsAgo,
      },
      // 400 days ago: outside 365-day default window
      {
        orgId,
        userId: auth.user._id,
        accountId: account._id,
        amount: -500,
        type: "expense",
        category: "Travel",
        description: "Flight",
        date: longAgo,
      },
    ]);

    // Another user in another org to verify isolation
    const otherAuth = await createAuthedUser();
    const otherOrg = await ensurePersonalOrgForUser(otherAuth.user._id);
    const otherAccount = await AccountModel.create({
      orgId: otherOrg.orgId,
      name: "Other Account",
      type: "checking",
      currency: "USD",
      openingBalance: 1000,
    });
    await TransactionModel.create({
      orgId: otherOrg.orgId,
      userId: otherAuth.user._id,
      accountId: otherAccount._id,
      amount: -999,
      type: "expense",
      category: "Secret",
      description: "Other org expense",
      date: now,
    });

    // Test with default days_back (365)
    const res = await request(app)
      .get("/api/analytics/spending-heatmap")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    expect(res.body.org_id).toBe(String(orgId));
    expect(res.body.days_back).toBe(365);
    expect(Array.isArray(res.body.data)).toBe(true);

    const todayEntry = res.body.data.find((d: any) => d.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.count).toBe(2);
    expect(todayEntry.total).toBeCloseTo(60.75, 2);

    const yesterdayEntry = res.body.data.find((d: any) => d.date === yesterdayStr);
    expect(yesterdayEntry).toBeDefined();
    expect(yesterdayEntry.count).toBe(1);
    expect(yesterdayEntry.total).toBe(80);

    // Other org spend should not leak
    const otherOrgLeak = res.body.data.some((d: any) => d.total === 999);
    expect(otherOrgLeak).toBe(false);

    // Test with 30-day window (60 days ago should be excluded)
    const res30 = await request(app)
      .get("/api/analytics/spending-heatmap?days_back=30")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    expect(res30.body.days_back).toBe(30);
    const sixtyDaysEntry = res30.body.data.find((d: any) => d.total === 120);
    expect(sixtyDaysEntry).toBeUndefined();
  });
});
