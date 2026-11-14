import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import MemoryRecordModel from "../models/memoryRecordModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { retrieveUnifiedContext } from "../services/unifiedContextRetrievalService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const objectId = () => new mongoose.Types.ObjectId();

describe("Unified Ranked Memory, Document & Transaction Retrieval Engine", () => {
  const app = createApp();
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    await MemoryRecordModel.init();
    await WorkspaceFileModel.init();
    await WorkspaceKnowledgeChunkModel.init();
    await TransactionModel.init();
  }, 60_000);

  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearTestDb();
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token);
  });

  describe("Service: retrieveUnifiedContext", () => {
    it("fuses memories, workspace document chunks, and transactions with Reciprocal Rank Fusion", async () => {
      const orgId = objectId();
      const userId = objectId();
      const rawFileId = objectId();

      // 1. Seed Memory Record
      await MemoryRecordModel.create({
        orgId,
        userId,
        key: "dining_budget_rule",
        value: "Cap restaurant dining and take-out to $350 monthly.",
        confidence: 0.95,
        source: "explicit",
      });

      // 2. Seed Workspace File and Knowledge Chunk
      const file = await WorkspaceFileModel.create({
        orgId,
        userId,
        fileId: rawFileId,
        originalName: "Bank_Statement_March.pdf",
        sizeBytes: 1024,
        mimeType: "application/pdf",
        kind: "document",
      });

      await WorkspaceKnowledgeChunkModel.create({
        orgId,
        userId,
        workspaceFileId: file._id,
        fileId: rawFileId,
        chunkIndex: 0,
        text: "Monthly dining and entertainment expenditures reached $340.50 across 12 visits.",
        modality: "text",
        sectionTitle: "Discretionary Spending",
        pageNumber: 2,
        tokenCountEstimate: 20,
        embedding: [],
      });

      // 3. Seed Ledger Transactions
      await TransactionModel.create({
        orgId,
        userId,
        type: "expense",
        amount: -45.50,
        currency: "USD",
        category: "Dining",
        merchantName: "Olive Garden Italian",
        description: "Family dinner meal",
        date: new Date(),
        needsReview: false,
      });

      // Query across all 3
      const res = await retrieveUnifiedContext({
        orgId,
        userId,
        query: "dining expenditure monthly restaurant",
        limit: 10,
      });

      expect(res.total).toBe(3);
      expect(res.breakdown.memory).toBe(1);
      expect(res.breakdown.file).toBe(1);
      expect(res.breakdown.transaction).toBe(1);

      // Verify structure of unified items
      const types = res.results.map((r) => r.sourceType);
      expect(types).toContain("memory");
      expect(types).toContain("file");
      expect(types).toContain("transaction");

      // Verify RRF scoring & ranks
      expect(res.results[0].rank).toBe(1);
      expect(res.results[0].score).toBe(100); // Normalized top score
      expect(res.results[0].rrfScore).toBeGreaterThan(0);
      expect(res.groundedContextPrompt).toContain("### UNIFIED RANKED CONTEXT");
      expect(res.groundedContextPrompt).toContain("Cap restaurant dining");
    });

    it("enforces strict multi-tenant isolation across all three silos", async () => {
      const orgA = objectId();
      const userA = objectId();
      const orgB = objectId();
      const userB = objectId();

      // Seed for user A
      await MemoryRecordModel.create({
        orgId: orgA,
        userId: userA,
        key: "secret_rule_A",
        value: "Secret financial plan for user A",
        confidence: 0.9,
      });

      await TransactionModel.create({
        orgId: orgA,
        userId: userA,
        type: "expense",
        amount: -100,
        category: "Secret",
        merchantName: "Classified Merchant A",
        description: "Classified Transaction A",
        date: new Date(),
        needsReview: false,
      });

      // Query as user B
      const resB = await retrieveUnifiedContext({
        orgId: orgB,
        userId: userB,
        query: "Secret financial plan classified",
      });

      expect(resB.total).toBe(0);
      expect(resB.results).toEqual([]);
    });

    it("respects source filtering parameters", async () => {
      const orgId = objectId();
      const userId = objectId();

      await MemoryRecordModel.create({
        orgId,
        userId,
        key: "coffee_habit",
        value: "I drink Starbucks espresso every morning",
        confidence: 0.8,
      });

      await TransactionModel.create({
        orgId,
        userId,
        type: "expense",
        amount: -6.25,
        category: "Coffee",
        merchantName: "Starbucks Coffee",
        description: "Morning coffee",
        date: new Date(),
        needsReview: false,
      });

      // Filter only to memory
      const memOnly = await retrieveUnifiedContext({
        orgId,
        userId,
        query: "Starbucks coffee",
        sources: ["memory"],
      });

      expect(memOnly.total).toBe(1);
      expect(memOnly.results[0].sourceType).toBe("memory");
      expect(memOnly.breakdown.transaction).toBe(0);

      // Filter only to transaction
      const txnOnly = await retrieveUnifiedContext({
        orgId,
        userId,
        query: "Starbucks coffee",
        sources: ["transaction"],
      });

      expect(txnOnly.total).toBe(1);
      expect(txnOnly.results[0].sourceType).toBe("transaction");
      expect(txnOnly.breakdown.memory).toBe(0);
    });
  });

  describe("HTTP Controller: /api/search/unified-context", () => {
    it("GET /api/search/unified-context returns 200 with ranked results", async () => {
      const auth = await createAuthedUser();
      const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

      // Seed memory for authenticated user
      await MemoryRecordModel.create({
        orgId,
        userId: auth.user._id,
        key: "travel_budget",
        value: "Annual vacation budget is $4000.",
        confidence: 0.9,
        source: "explicit",
      });

      const res = await request(app)
        .get("/api/search/unified-context")
        .query({ q: "vacation travel budget", limit: 5 })
        .set("Cookie", auth.cookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.results[0].title).toContain("Memory: travel_budget");
      expect(res.body.groundedContextPrompt).toBeDefined();
    });

    it("POST /api/search/unified-context supports JSON payload with source filters", async () => {
      const auth = await createAuthedUser();
      const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

      // Seed transaction
      await TransactionModel.create({
        orgId,
        userId: auth.user._id,
        type: "expense",
        amount: -120.0,
        currency: "USD",
        category: "Utilities",
        merchantName: "Pacific Gas & Electric",
        description: "Monthly power bill",
        date: new Date(),
        needsReview: false,
      });

      const res = await request(app)
        .post("/api/search/unified-context")
        .set("Cookie", [auth.cookie, csrfCookie])
        .set("x-csrf-token", csrfToken)
        .send({
          query: "power bill electric utilities",
          sources: ["transaction"],
          limit: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.breakdown.transaction).toBeGreaterThanOrEqual(1);
      expect(res.body.results[0].sourceType).toBe("transaction");
      expect(res.body.results[0].citation).toContain("txn:");
    });

    it("returns 400 when query parameter is missing or empty", async () => {
      const auth = await createAuthedUser();

      const res = await request(app)
        .get("/api/search/unified-context")
        .query({ q: "" })
        .set("Cookie", auth.cookie);

      expect(res.status).toBe(400);
    });
  });
});
