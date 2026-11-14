import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TransactionModel from "../models/transactionModel";
import MerchantModel from "../models/merchantModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Transactions Multi-Currency FX, Merchant Clustering & Bank Feed Ingestion (Batch 30)", () => {
  const app = createApp();
  let cookieA = "";
  let csrfCookieA = "";
  let csrfTokenA = "";

  let cookieB = "";
  let csrfCookieB = "";
  let csrfTokenB = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // User A
    const authA = await createAuthedUser();
    cookieA = authA.cookie;

    const csrfA = await request(app).get("/api/auth/csrf").set("Cookie", cookieA).expect(200);
    csrfCookieA = (csrfA.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfTokenA = csrfA.body.csrf_token as string;

    // User B
    const authB = await createAuthedUser();
    cookieB = authB.cookie;

    const csrfB = await request(app).get("/api/auth/csrf").set("Cookie", cookieB).expect(200);
    csrfCookieB = (csrfB.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfTokenB = csrfB.body.csrf_token as string;

    // Seed sample transactions for userA via standard API
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "STARBUCKS #1042 SEATTLE WA",
        amount: 10.0,
        type: "expense",
        category: "Uncategorized",
        date: "2026-02-15T00:00:00.000Z",
        splits: [
          { category: "Food & Dining", amount: 6.0 },
          { category: "Snacks", amount: 4.0 },
        ],
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "Starbucks Coffee Main St",
        amount: 15.0,
        type: "expense",
        category: "Food & Dining",
        date: "2026-02-16T00:00:00.000Z",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "AMZN Mktp US*2A41B",
        amount: 50.0,
        type: "expense",
        category: "Shopping",
        date: "2026-02-17T00:00:00.000Z",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "Payroll Direct Deposit",
        amount: 2500.0,
        type: "income",
        category: "Income",
        date: "2026-02-18T00:00:00.000Z",
      })
      .expect(201);
  });

  it("normalizes transactions into EUR (0.92 rate) and JPY (155 rate with integer rounding)", async () => {
    // 1. Query with EUR
    const resEur = await request(app)
      .get("/api/transactions?currency=EUR")
      .set("Cookie", [cookieA, csrfCookieA]);

    expect(resEur.status).toBe(200);
    expect(resEur.body.currency).toBe("EUR");
    expect(resEur.body.fx_rate).toBe(0.92);
    expect(resEur.body.currency_symbol).toBe("€");
    expect(resEur.body.transactions.length).toBe(4);

    const txStarbucks = resEur.body.transactions.find((t: any) =>
      t.description.includes("STARBUCKS #1042")
    );
    expect(txStarbucks).toBeDefined();
    expect(txStarbucks.amount).toBe(-9.2); // -10 * 0.92
    expect(txStarbucks.raw_amount).toBe(-10.0);
    expect(txStarbucks.currency).toBe("EUR");
    expect(txStarbucks.splits[0].amount).toBe(5.52); // 6 * 0.92
    expect(txStarbucks.splits[0].raw_amount).toBe(6.0);

    // 2. Query with JPY (Integer rounding)
    const resJpy = await request(app)
      .get("/api/transactions?currency=JPY")
      .set("Cookie", [cookieA, csrfCookieA]);

    expect(resJpy.status).toBe(200);
    expect(resJpy.body.currency).toBe("JPY");
    expect(resJpy.body.fx_rate).toBe(155);
    expect(resJpy.body.currency_symbol).toBe("¥");

    const txStarbucksJpy = resJpy.body.transactions.find((t: any) =>
      t.description.includes("STARBUCKS #1042")
    );
    expect(txStarbucksJpy.amount).toBe(-1550); // -10 * 155 rounded integer
    expect(txStarbucksJpy.splits[0].amount).toBe(930); // 6 * 155
  });

  it("normalizes transactions summary aggregates into target currency", async () => {
    const resSummary = await request(app)
      .get("/api/transactions/summary?from=2026-02-01&to=2026-02-28&currency=EUR")
      .set("Cookie", [cookieA, csrfCookieA]);

    expect(resSummary.status).toBe(200);
    expect(resSummary.body.currency).toBe("EUR");
    expect(resSummary.body.fx_rate).toBe(0.92);
    expect(resSummary.body.monthly[0].income).toBe(2300); // 2500 * 0.92
    expect(resSummary.body.monthly[0].expense).toBe(69); // (10 + 15 + 50) * 0.92 = 75 * 0.92 = 69
  });

  it("detects and computes merchant clusters, then batch applies normalization", async () => {
    // 1. Get merchant clusters
    const resClusters = await request(app)
      .get("/api/transactions/merchant-clusters?currency=USD")
      .set("Cookie", [cookieA, csrfCookieA]);

    expect(resClusters.status).toBe(200);
    expect(resClusters.body.clusters).toBeInstanceOf(Array);
    expect(resClusters.body.clusters.length).toBeGreaterThanOrEqual(2);

    const starbucksCluster = resClusters.body.clusters.find((c: any) => c.cluster_key === "starbucks");
    expect(starbucksCluster).toBeDefined();
    expect(starbucksCluster.normalized_name).toBe("Starbucks");
    expect(starbucksCluster.count).toBe(2);
    expect(starbucksCluster.total_spend).toBe(25);
    expect(starbucksCluster.raw_descriptions.length).toBe(2);
    expect(starbucksCluster.transaction_ids.length).toBe(2);

    // 2. Apply merchant cluster normalization
    const resApply = await request(app)
      .post("/api/transactions/merchant-clusters/apply")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        cluster_key: "starbucks",
        normalized_name: "Starbucks",
        category: "Food & Dining",
        transaction_ids: starbucksCluster.transaction_ids,
      });

    expect(resApply.status).toBe(200);
    expect(resApply.body.success).toBe(true);
    expect(resApply.body.updated_count).toBe(2);

    // 3. Verify in database
    const updatedTxs = await TransactionModel.find({ _id: { $in: starbucksCluster.transaction_ids } });
    for (const tx of updatedTxs) {
      expect(tx.description).toBe("Starbucks");
      expect(tx.category).toBe("Food & Dining");
    }

    // Verify merchant directory entry created
    const merchant = await MerchantModel.findOne({ normalizedName: "starbucks" });
    expect(merchant).toBeDefined();
    expect(merchant?.name).toBe("Starbucks");
    expect(merchant?.categoryDefault).toBe("Food & Dining");
  });

  it("ingests inbound bank feed webhook with deduplication and tenant isolation", async () => {
    const payload = {
      webhook_type: "TRANSACTIONS" as const,
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      transactions: [
        {
          transaction_id: "bank-feed-tx-101",
          amount: 85.5, // expense
          date: "2026-02-20T10:00:00Z",
          name: "Uber Trip #4459",
          category: ["Transportation", "Taxi"],
          pending: false,
        },
        {
          transaction_id: "bank-feed-tx-102",
          amount: -1200.0, // income
          date: "2026-02-21T08:00:00Z",
          name: "Client Consulting Retainer",
          category: ["Income"],
          pending: false,
        },
      ],
    };

    // 1. Initial ingestion
    const resFeed = await request(app)
      .post("/api/transactions/bank-feed")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send(payload);

    expect(resFeed.status).toBe(200);
    expect(resFeed.body.success).toBe(true);
    expect(resFeed.body.processed).toBe(2);
    expect(resFeed.body.inserted).toBe(2);
    expect(resFeed.body.duplicates_skipped).toBe(0);

    // 2. Duplicate ingestion should be safely skipped
    const resDup = await request(app)
      .post("/api/transactions/bank-feed")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send(payload);

    expect(resDup.status).toBe(200);
    expect(resDup.body.inserted).toBe(0);
    expect(resDup.body.duplicates_skipped).toBe(2);

    // 3. Verify tenant isolation: userB in orgB cannot see userA's transactions
    const resOrgB = await request(app)
      .get("/api/transactions")
      .set("Cookie", [cookieB, csrfCookieB]);

    expect(resOrgB.status).toBe(200);
    expect(resOrgB.body.transactions.length).toBe(0);
  });
});
