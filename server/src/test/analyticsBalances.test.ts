import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AccountModel from "../models/accountModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("analytics account balances", () => {
  const app = createApp();
  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    configurePassport();
  });
  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("includes opening balances and applies signed expenses and investments once", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const account = await AccountModel.create({
      orgId, name: "QA checking", type: "checking", currency: "USD", openingBalance: 1000.50,
    });
    const credit = await AccountModel.create({
      orgId, name: "QA credit", type: "credit", currency: "USD", openingBalance: -50.25,
    });
    await TransactionModel.create([
      { orgId, userId: auth.user._id, accountId: account._id, amount: 100, type: "income", category: "Salary", description: "QA income", date: new Date() },
      { orgId, userId: auth.user._id, accountId: account._id, amount: -25.25, type: "expense", category: "Food", description: "QA expense", date: new Date() },
      { orgId, userId: auth.user._id, accountId: account._id, amount: -10, type: "investment", category: "Investing", description: "QA investment", date: new Date() },
    ]);
    const other = await createAuthedUser();
    const otherMembership = await ensurePersonalOrgForUser(other.user._id);
    await AccountModel.create({
      orgId: otherMembership.orgId, name: "Foreign account", type: "checking", currency: "USD", openingBalance: 999999,
    });

    const response = await request(app).get("/api/analytics/account-balances")
      .set("Cookie", auth.cookie).set("X-Org-Id", String(orgId)).expect(200);
    expect(response.body.accounts).toHaveLength(2);
    expect(response.body.accounts.find((row: any) => row.id === String(account._id)))
      .toMatchObject({ balance: 1065.25, transaction_count: 3 });
    expect(response.body.accounts.find((row: any) => row.id === String(credit._id)))
      .toMatchObject({ balance: -50.25, transaction_count: 0 });
    expect(response.body.summary).toEqual({ total_assets: 1065.25, total_liabilities: 50.25, net_worth: 1015 });
  });
});
