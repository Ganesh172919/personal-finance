import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import WorkspaceFileModel from "../models/workspaceFileModel";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { ensureWorkspaceFileChunks } from "../services/retrievalService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const objectId = () => new mongoose.Types.ObjectId();

describe("Document Q&A Semantic Evaluation & Grounding API (POST /api/files/qa)", () => {
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

  it("rejects unauthenticated requests with 401", async () => {
    await request(app)
      .post("/api/files/qa")
      .send({ question: "What is my total tax liability?" })
      .expect(401);
  });

  it("rejects invalid request body with 400", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await request(app)
      .post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({ question: "" })
      .expect(400);
  });

  it("preserves source currency and does not invent physical pages for unpaginated text", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const text = "Invoice balance due: EUR 545.50\nPayment terms: Net 30 days.";
    const file = await WorkspaceFileModel.create({
      orgId, userId: auth.user._id, fileId: objectId(), originalName: "invoice.txt",
      mimeType: "text/plain", sizeBytes: text.length, kind: "document", status: "processed",
      extractedText: text,
    });
    const res = await request(app).post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({ question: "What invoice balance is due and what are the payment terms?", workspaceFileIds: [String(file._id)] })
      .expect(200);
    expect(res.body.passages.length).toBeGreaterThan(0);
    expect(res.body.directAnswer).toContain("EUR 545.50");
    expect(res.body.directAnswer).not.toContain("$");
    expect(res.body.directAnswer).not.toContain("Page 1");
    expect(res.body.physicalPages).toEqual([]);
    expect(res.body.passages[0].pageNumber).toBeUndefined();
    expect(res.body.passages[0].citation).not.toContain(":p1");
  });

  it("answers tax questions with exact physical page retention and citations", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const docText = [
      "IRS Form 1040 U.S. Individual Income Tax Return 2025\nLine 1a: Total amount from Form W-2: $95,000.00\nLine 15: Taxable Income: $80,400.00",
      "\f",
      "Form 1040 Page 2 (2025)\nLine 24: Total Tax Liability: $13,200.00\nLine 25a: Federal Income Tax Withheld: $15,000.00\nLine 34: Refund Due: $1,800.00",
    ].join("");

    const taxFile = await WorkspaceFileModel.create({
      orgId,
      userId: auth.user._id,
      fileId: objectId(),
      originalName: "Form_1040_2025.pdf",
      mimeType: "application/pdf",
      sizeBytes: docText.length,
      kind: "document",
      status: "processed",
      extractedText: docText,
      extractedPageCount: 2,
    });

    await ensureWorkspaceFileChunks({
      orgId,
      userId: auth.user._id,
      workspaceFileId: taxFile._id,
      fileId: taxFile.fileId,
      originalName: taxFile.originalName,
      sourceKind: "document",
      extractedText: docText,
      pageCount: 2,
    });

    const res = await request(app)
      .post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        question: "What is my total tax liability on Form 1040?",
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.isGrounded).toBe(true);
    expect(res.body.groundingScore).toBeGreaterThanOrEqual(0.60);
    expect(res.body.physicalPages).toContain(2);

    const topPassage = res.body.passages[0];
    expect(topPassage.pageNumber).toBe(2);
    expect(topPassage.fileName).toBe("Form_1040_2025.pdf");
    expect(topPassage.citation).toContain("Form_1040_2025.pdf:p2");
    expect(topPassage.text).toContain("Total Tax Liability");
    expect(res.body.directAnswer).toContain("Page 2");
    expect(res.body.directAnswer).toContain("13,200.00");
  });

  it("quotes adjacent checklist items from the same physical page", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const text = "Review checklist\n• Compare spending with the budget\n• Check the largest category\nDocument footer";
    const file = await WorkspaceFileModel.create({
      orgId, userId: auth.user._id, fileId: objectId(), originalName: "checklist.pdf",
      mimeType: "application/pdf", sizeBytes: text.length, kind: "document", status: "processed",
      extractedText: text, extractedPageCount: 1,
    });
    const result = await request(app).post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).set("X-Org-Id", String(orgId))
      .send({ question: "What two review steps does the checklist list?", workspaceFileIds: [String(file._id)] })
      .expect(200);
    expect(result.body.directAnswer).toContain("Compare spending with the budget");
    expect(result.body.directAnswer).toContain("Check the largest category");
    expect(result.body.directAnswer).not.toContain("Document footer");
    expect(result.body.physicalPages).toEqual([1]);
  });

  it("scopes question answering to explicitly selected files", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const invoiceText = "Amazon Web Services Cloud Invoice\nPayment Terms: Net 30 Days\nTotal Amount Due: $545.50";
    const receiptText = "Walgreens Pharmacy #04128\nPrescription Co-pay: $15.00\nTotal Paid: $15.00";

    const invoiceFile = await WorkspaceFileModel.create({
      orgId,
      userId: auth.user._id,
      fileId: objectId(),
      originalName: "AWS_Invoice.pdf",
      mimeType: "application/pdf",
      sizeBytes: invoiceText.length,
      kind: "document",
      status: "processed",
      extractedText: invoiceText,
      extractedPageCount: 1,
    });

    const receiptFile = await WorkspaceFileModel.create({
      orgId,
      userId: auth.user._id,
      fileId: objectId(),
      originalName: "Walgreens_Receipt.png",
      mimeType: "image/png",
      sizeBytes: receiptText.length,
      kind: "image",
      status: "processed",
      extractedText: receiptText,
      extractedPageCount: 1,
    });

    await ensureWorkspaceFileChunks({
      orgId,
      userId: auth.user._id,
      workspaceFileId: invoiceFile._id,
      fileId: invoiceFile.fileId,
      originalName: invoiceFile.originalName,
      sourceKind: "document",
      extractedText: invoiceText,
      pageCount: 1,
    });

    await ensureWorkspaceFileChunks({
      orgId,
      userId: auth.user._id,
      workspaceFileId: receiptFile._id,
      fileId: receiptFile.fileId,
      originalName: receiptFile.originalName,
      sourceKind: "image",
      extractedText: receiptText,
      pageCount: 1,
    });

    // Query scoped strictly to the invoice file
    const res = await request(app)
      .post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        question: "What are the payment terms and due amount?",
        workspaceFileIds: [String(invoiceFile._id)],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.passages.length).toBeGreaterThanOrEqual(1);
    expect(res.body.passages[0].workspaceFileId).toBe(String(invoiceFile._id));
    expect(res.body.passages.some((p: any) => p.workspaceFileId === String(receiptFile._id))).toBe(false);
    expect(res.body.directAnswer).toContain("Net 30");
  });

  it("safely handles out-of-scope inquiries with clean non-hallucination rejection", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const billText = "City Power & Electric Monthly Statement\nElectricity: 450 kWh\nTotal Charges: $84.20";

    const billFile = await WorkspaceFileModel.create({
      orgId,
      userId: auth.user._id,
      fileId: objectId(),
      originalName: "Electric_Bill.pdf",
      mimeType: "application/pdf",
      sizeBytes: billText.length,
      kind: "document",
      status: "processed",
      extractedText: billText,
      extractedPageCount: 1,
    });

    await ensureWorkspaceFileChunks({
      orgId,
      userId: auth.user._id,
      workspaceFileId: billFile._id,
      fileId: billFile.fileId,
      originalName: billFile.originalName,
      sourceKind: "document",
      extractedText: billText,
      pageCount: 1,
    });

    const res = await request(app)
      .post("/api/files/qa")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        question: "What was my cryptocurrency capital gains deduction on this bill?",
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.isGrounded).toBe(false);
    expect(res.body.directAnswer).toContain("do not contain sufficient evidence");
  });

  it("strictly enforces multi-tenant isolation across different organizations", async () => {
    const authA = await createAuthedUser();
    const orgA = await ensurePersonalOrgForUser(authA.user._id);

    const secretDoc = "Confidential Executive Compensation: Bonus $75,000.00";
    const fileA = await WorkspaceFileModel.create({
      orgId: orgA.orgId,
      userId: authA.user._id,
      fileId: objectId(),
      originalName: "Executive_Comp.pdf",
      mimeType: "application/pdf",
      sizeBytes: secretDoc.length,
      kind: "document",
      status: "processed",
      extractedText: secretDoc,
      extractedPageCount: 1,
    });

    await ensureWorkspaceFileChunks({
      orgId: orgA.orgId,
      userId: authA.user._id,
      workspaceFileId: fileA._id,
      fileId: fileA.fileId,
      originalName: fileA.originalName,
      sourceKind: "document",
      extractedText: secretDoc,
      pageCount: 1,
    });

    // User B in Org B attempts to query User A's confidential document
    const authB = await createAuthedUser();
    const orgB = await ensurePersonalOrgForUser(authB.user._id);

    const resB = await request(app)
      .post("/api/files/qa")
      .set("Cookie", [authB.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgB.orgId.toString())
      .send({
        question: "What is the executive bonus?",
        workspaceFileIds: [String(fileA._id)],
      })
      .expect(200);

    expect(resB.body.passages).toHaveLength(0);
    expect(resB.body.isGrounded).toBe(false);
  });
});
