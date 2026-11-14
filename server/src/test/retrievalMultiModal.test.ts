import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import WorkspaceFileModel from "../models/workspaceFileModel";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import {
  cosineSimilarity,
  detectChunkModality,
  detectQueryModality,
  ensureWorkspaceFileChunks,
  extractChunkEntities,
  generateChunkEmbedding,
  GROUNDING_THRESHOLD,
  scoreChunkHybrid,
} from "../services/retrievalService";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const objectId = () => new mongoose.Types.ObjectId();

describe("Multi-Modal Vector Indexing & Grounded Retrieval", () => {
  const app = createApp();
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    await WorkspaceKnowledgeChunkModel.init();
    await WorkspaceFileModel.init();
  }, 60_000);

  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearTestDb();
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token);
  });

  describe("Unit: Modality Detection & Entity Extraction", () => {
    it("detects table modality from CSV lines and markdown pipe tables", () => {
      const csv = "Date,Merchant,Category,Amount\n2026-03-01,Starbucks,Coffee,-5.50\n2026-03-02,Target,Groceries,-45.20";
      expect(detectChunkModality(csv, "spreadsheet", "expenses.csv")).toBe("table");

      const mdTable = "| Account | Type | Balance |\n| Checking | Liquid | $5,000 |\n| Savings | HYSA | $25,000 |";
      expect(detectChunkModality(mdTable, "document", "accounts.md")).toBe("table");
    });

    it("detects image_ocr modality from receipt markers and image sources", () => {
      const receiptOcr = "STORE #421 TARGET\n03/15/2026 14:32\nGROCERIES $45.90\nSUBTOTAL $45.90\nTAX $3.67\nTOTAL DUE $49.57\nVISA **** 1234";
      expect(detectChunkModality(receiptOcr, "image", "target_receipt.jpg")).toBe("image_ocr");
    });

    it("detects structured_data from JSON strings", () => {
      const json = JSON.stringify({ transactions: [{ id: "tx_1", amount: 120.5 }] });
      expect(detectChunkModality(json, "data", "transactions.json")).toBe("structured_data");
    });

    it("detects standard prose as text modality", () => {
      const prose = "We recommend keeping 3 to 6 months of basic living expenses in a high yield savings account.";
      expect(detectChunkModality(prose, "document", "strategy.pdf")).toBe("text");
    });

    it("detects query modality intent", () => {
      expect(detectQueryModality("Show me the balance sheet table columns")).toBe("table");
      expect(detectQueryModality("Find the Starbucks receipt total")).toBe("image_ocr");
      expect(detectQueryModality("Export JSON schema payload")).toBe("structured_data");
      expect(detectQueryModality("What is our general savings strategy?")).toBeUndefined();
    });

    it("extracts financial entities: amounts, dates, currencies, and merchants", () => {
      const text = "Paid $125.50 at WHOLE FOODS on 2026-04-10 with EUR 45 exchange fee.";
      const entities = extractChunkEntities(text);
      expect(entities.amounts).toContain(125.5);
      expect(entities.currencies).toContain("USD");
      expect(entities.currencies).toContain("EUR");
      expect(entities.dates).toContain("2026-04-10");
      expect(entities.merchants).toContain("WHOLE FOODS");
    });
  });

  describe("Unit: 64-D Vector Embeddings & Hybrid Scoring", () => {
    it("generates unit-length normalized vector embeddings", () => {
      const vec = generateChunkEmbedding({
        text: "Emergency savings reserve in high yield savings account.",
        modality: "text",
        sectionTitle: "Savings Strategy",
      });
      expect(vec).toHaveLength(64);
      let normSq = 0;
      for (const val of vec) normSq += val * val;
      expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 2);
    });

    it("computes cosine similarity accurately between financial concepts", () => {
      const vecA = generateChunkEmbedding({ text: "Emergency reserve and liquid cash savings cushion." });
      const vecB = generateChunkEmbedding({ text: "Deposit into high yield savings account emergency fund." });
      const vecC = generateChunkEmbedding({ text: "Bitcoin cryptocurrency digital asset trade ledger." });

      const simRelated = cosineSimilarity(vecA, vecB);
      const simUnrelated = cosineSimilarity(vecA, vecC);

      expect(simRelated).toBeGreaterThan(0.60);
      expect(simRelated).toBeGreaterThan(simUnrelated);
    });

    it("scores chunks with hybrid formula and verifies grounding threshold G >= 0.70", () => {
      const query = "Loan prepayment penalty clause";
      const terms = ["penalty", "clause", "loan", "prepayment"];
      const chunkText = "Loan prepayment penalty clause: borrower pays 2 percent of outstanding principal balance.";

      const queryEmbedding = generateChunkEmbedding({ text: query });
      const chunkEmbedding = generateChunkEmbedding({ text: chunkText });

      const scored = scoreChunkHybrid({
        chunkText,
        query,
        terms,
        chunkModality: "text",
        chunkEmbedding,
        queryEmbedding,
      });

      expect(scored.hybridScore).toBeGreaterThan(15);
      expect(scored.cosineSimilarity).toBeGreaterThan(0.60);
      expect(scored.groundingConfidence).toBeGreaterThanOrEqual(GROUNDING_THRESHOLD);
      expect(scored.isGrounded).toBe(true);
    });
  });

  describe("Integration: End-to-End POST /api/files/search", () => {
    it("indexes multi-modal chunks and returns filtered results with citations", async () => {
      const authUser = await createAuthedUser();
      const personalOrg = await ensurePersonalOrgForUser(authUser.user._id);
      const orgId = personalOrg.orgId;

      const fileText = [
        "# Financial Policies\nWe require all department expenses to maintain 10% emergency reserves.",
        "\f",
        "Sheet: March Expenses\nDate,Merchant,Category,Amount\n2026-03-01,Starbucks,Coffee,$5.50\n2026-03-02,Target,Groceries,$89.40",
        "\f",
        "STORE #102 COSTCO WHOLESALE\n03/10/2026\nBULK GROCERIES $245.00\nSUBTOTAL $245.00\nTAX $18.50\nTOTAL $263.50\nVISA 4921",
      ].join("");

      const workspaceFile = await WorkspaceFileModel.create({
        orgId,
        userId: authUser.user._id,
        fileId: objectId(),
        originalName: "financial_report.pdf",
        mimeType: "application/pdf",
        sizeBytes: fileText.length,
        kind: "document",
        status: "processed",
        extractedText: fileText,
        extractedPageCount: 3,
      });

      await ensureWorkspaceFileChunks({
        orgId,
        userId: authUser.user._id,
        workspaceFileId: workspaceFile._id,
        fileId: workspaceFile.fileId,
        originalName: workspaceFile.originalName,
        sourceKind: "document",
        extractedText: fileText,
        pageCount: 3,
      });

      // 1. Search without modality filter
      const resAll = await request(app)
        .post("/api/files/search")
        .set("Cookie", [authUser.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", orgId.toString())
        .send({ query: "emergency reserves policy" })
        .expect(200);

      expect(resAll.body.chunks.length).toBeGreaterThanOrEqual(1);
      expect(resAll.body.chunks[0].citation).toContain(String(workspaceFile._id));
      expect(resAll.body.chunks[0].modality).toBe("text");
      expect(resAll.body.chunks[0].groundingConfidence).toBeGreaterThan(0.35);

      // 1b. Exact phrase search achieves high grounding confidence G >= 0.70
      const resGrounded = await request(app)
        .post("/api/files/search")
        .set("Cookie", [authUser.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", orgId.toString())
        .send({ query: "emergency reserves", minConfidence: 0.65 })
        .expect(200);

      expect(resGrounded.body.chunks.length).toBeGreaterThanOrEqual(1);
      expect(resGrounded.body.chunks[0].groundingConfidence).toBeGreaterThanOrEqual(0.65);
      expect(resGrounded.body.chunks[0].isGrounded).toBe(true);

      // 2. Search with table modality filter
      const resTable = await request(app)
        .post("/api/files/search")
        .set("Cookie", [authUser.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", orgId.toString())
        .send({ query: "March expenses Starbucks", modality: "table" })
        .expect(200);

      expect(resTable.body.chunks.length).toBeGreaterThanOrEqual(1);
      expect(resTable.body.chunks[0].modality).toBe("table");
      expect(resTable.body.chunks[0].snippet).toContain("Starbucks");

      // 3. Search with image_ocr modality filter
      const resOcr = await request(app)
        .post("/api/files/search")
        .set("Cookie", [authUser.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", orgId.toString())
        .send({ query: "Costco receipt total tax", modality: "image_ocr" })
        .expect(200);

      expect(resOcr.body.chunks.length).toBeGreaterThanOrEqual(1);
      expect(resOcr.body.chunks[0].modality).toBe("image_ocr");
      expect(resOcr.body.chunks[0].entities?.merchants).toContain("COSTCO");

      // 4. Multi-tenant isolation: another user cannot see these chunks
      const otherUser = await createAuthedUser();
      const otherOrg = await ensurePersonalOrgForUser(otherUser.user._id);

      const resOther = await request(app)
        .post("/api/files/search")
        .set("Cookie", [otherUser.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", otherOrg.orgId.toString())
        .send({ query: "Costco receipt" })
        .expect(200);

      expect(resOther.body.chunks).toHaveLength(0);
    });
  });
});
