import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TransactionModel from "../models/transactionModel";
import MerchantModel from "../models/merchantModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";
import {
  generateMerchantEmbedding,
  cosineSimilarity,
  clusterMerchantTransactions,
  sanitizeMerchantDescription,
  MERCHANT_EMBEDDING_DIMENSION,
} from "../services/merchantEmbeddingClustering";

describe("Machine Learning Merchant Embedding Clustering Service (Batch 36)", () => {
  it("generates 64-dimensional L2-normalized vector embeddings", () => {
    const raw = "AMZN MKTP US*2A41B SEATTLE WA";
    const emb = generateMerchantEmbedding(raw);

    expect(emb).toBeInstanceOf(Array);
    expect(emb.length).toBe(MERCHANT_EMBEDDING_DIMENSION);

    // Verify L2 unit norm ||v|| == 1.0
    let sumSq = 0;
    for (const val of emb) {
      sumSq += val * val;
    }
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it("sanitizes noisy bank statements and strips terminal codes", () => {
    const raw = "STARBUCKS STORE #1042 SEATTLE WA POS DEBIT 10/24";
    const clean = sanitizeMerchantDescription(raw);

    expect(clean).not.toContain("#1042");
    expect(clean).not.toContain("pos");
    expect(clean).not.toContain("debit");
    expect(clean).toContain("starbucks");
  });

  it("calculates high cosine similarity for merchant variants and low for orthogonal sectors", () => {
    const vAmzn1 = generateMerchantEmbedding("AMZN MKTP US*2A41B");
    const vAmzn2 = generateMerchantEmbedding("Amazon.com*MB92 Retail");
    const vSbux = generateMerchantEmbedding("STARBUCKS COFFEE #491");
    const vShell = generateMerchantEmbedding("SHELL OIL 1294821 GAS STATION");

    const simAmzn = cosineSimilarity(vAmzn1, vAmzn2);
    const simCross = cosineSimilarity(vAmzn1, vShell);

    expect(simAmzn).toBeGreaterThanOrEqual(0.80);
    expect(simCross).toBeLessThan(simAmzn);
  });

  it("clusters noisy bank descriptions into canonical brand clusters with high semantic similarity", () => {
    const sampleTxs = [
      { id: "tx-1", description: "AMZN MKTP US*2A41B", amount: -45.5, category: "Shopping" },
      { id: "tx-2", description: "Amazon.com*MB92", amount: -29.99, category: "Uncategorized" },
      { id: "tx-3", description: "Amazon Prime Video", amount: -14.99, category: "Shopping" },
      { id: "tx-4", description: "STARBUCKS #1042 SEATTLE WA", amount: -6.5, category: "Food & Dining" },
      { id: "tx-5", description: "SBUX COFFEE DOWNTOWN", amount: -5.75, category: "Uncategorized" },
      { id: "tx-6", description: "UBER *TRIP #8821", amount: -24.2, category: "Transportation" },
      { id: "tx-7", description: "Uber Eats Netherlands", amount: -32.0, category: "Transportation" },
    ];

    const clusters = clusterMerchantTransactions(sampleTxs);

    expect(clusters.length).toBe(3);

    const amazonCluster = clusters.find((c) => c.normalized_name === "Amazon");
    expect(amazonCluster).toBeDefined();
    expect(amazonCluster?.count).toBe(3);
    expect(amazonCluster?.suggested_category).toBe("Shopping");
    expect(amazonCluster?.semantic_similarity).toBeGreaterThanOrEqual(0.75);
    expect(amazonCluster?.confidence).toBeGreaterThanOrEqual(0.80);

    const starbucksCluster = clusters.find((c) => c.normalized_name === "Starbucks");
    expect(starbucksCluster).toBeDefined();
    expect(starbucksCluster?.count).toBe(2);
    expect(starbucksCluster?.suggested_category).toBe("Food & Dining");

    const uberCluster = clusters.find((c) => c.normalized_name === "Uber");
    expect(uberCluster).toBeDefined();
    expect(uberCluster?.count).toBe(2);
    expect(uberCluster?.suggested_category).toBe("Transportation");
  });

  it("resolves canonical name using existing merchants in database", () => {
    const sampleTxs = [
      { id: "tx-10", description: "Pied Piper Cloud Platform Ingest", amount: -150.0 },
      { id: "tx-11", description: "PIED PIPER COMPRESSION SUBSCRIPTION", amount: -150.0 },
    ];

    const existingMerchants = [
      {
        name: "Pied Piper",
        normalizedName: "pied piper",
        categoryDefault: "Software & Tech",
        aliases: ["pied piper", "pied piper cloud"],
      },
    ];

    const clusters = clusterMerchantTransactions(sampleTxs, { existingMerchants });

    expect(clusters.length).toBe(1);
    expect(clusters[0].normalized_name).toBe("Pied Piper");
    expect(clusters[0].suggested_category).toBe("Software & Tech");
  });
});

describe("Merchant Embedding Clustering API Integration (Batch 36)", () => {
  const app = createApp();
  let cookieA = "";
  let csrfCookieA = "";
  let csrfTokenA = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const authA = await createAuthedUser();
    cookieA = authA.cookie;

    const csrfA = await request(app).get("/api/auth/csrf").set("Cookie", cookieA).expect(200);
    csrfCookieA = (csrfA.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfTokenA = csrfA.body.csrf_token as string;

    // Seed diverse transactions
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "AMZN MKTP US*8K102",
        amount: 88.5,
        type: "expense",
        category: "Shopping",
        date: "2026-03-01T00:00:00.000Z",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "Amazon.com*Digital Video",
        amount: 14.99,
        type: "expense",
        category: "Uncategorized",
        date: "2026-03-02T00:00:00.000Z",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        description: "STARBUCKS #0812 SEATTLE",
        amount: 6.25,
        type: "expense",
        category: "Food & Dining",
        date: "2026-03-03T00:00:00.000Z",
      })
      .expect(201);
  });

  it("serves ML-clustered merchants with semantic similarity and confidence", async () => {
    const res = await request(app)
      .get("/api/transactions/merchant-clusters?currency=USD")
      .set("Cookie", [cookieA, csrfCookieA]);

    expect(res.status).toBe(200);
    expect(res.body.clusters).toBeInstanceOf(Array);
    expect(res.body.clusters.length).toBeGreaterThanOrEqual(2);

    const amazon = res.body.clusters.find((c: any) => c.cluster_key === "amazon");
    expect(amazon).toBeDefined();
    expect(amazon.normalized_name).toBe("Amazon");
    expect(amazon.count).toBe(2);
    expect(amazon.total_spend).toBe(103.49);
    expect(amazon.suggested_category).toBe("Shopping");
    expect(amazon.confidence).toBeGreaterThanOrEqual(0.80);
    expect(amazon.semantic_similarity).toBeGreaterThanOrEqual(0.70);
  });

  it("applies merchant cluster normalization and clears review flags", async () => {
    const resClusters = await request(app)
      .get("/api/transactions/merchant-clusters?currency=USD")
      .set("Cookie", [cookieA, csrfCookieA]);

    const amazon = resClusters.body.clusters.find((c: any) => c.cluster_key === "amazon");
    expect(amazon).toBeDefined();

    const resApply = await request(app)
      .post("/api/transactions/merchant-clusters/apply")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        cluster_key: amazon.cluster_key,
        normalized_name: "Amazon",
        category: "Shopping",
        transaction_ids: amazon.transaction_ids,
      });

    expect(resApply.status).toBe(200);
    expect(resApply.body.success).toBe(true);
    expect(resApply.body.updated_count).toBe(2);

    // Verify transactions updated
    const updated = await TransactionModel.find({ _id: { $in: amazon.transaction_ids } });
    for (const tx of updated) {
      expect(tx.description).toBe("Amazon");
      expect(tx.category).toBe("Shopping");
      expect(tx.review?.needs_attention).toBe(false);
    }

    // Verify merchant saved in database
    const merchant = await MerchantModel.findOne({ normalizedName: "amazon" });
    expect(merchant).toBeDefined();
    expect(merchant?.name).toBe("Amazon");
  });
});
