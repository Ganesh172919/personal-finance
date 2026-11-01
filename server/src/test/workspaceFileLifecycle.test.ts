import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { buildAiFinanceGrounding } from "../services/financeGrounding";
import { createAuthedUser } from "./authHelpers";
import { createTextPdf } from "./pdfTestHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("workspace file indexing API lifecycle", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  }, 60_000);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearTestDb();
    cookie = (await createAuthedUser()).cookie;
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token);
  });

  const upload = () => request(app).post("/api/files")
    .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
    .attach("files", Buffer.from("Loan repayment and prepayment terms. ".repeat(500)), {
      filename: "loan.txt", contentType: "text/plain",
    }).expect(201);

  it("keeps PDF page numbers through upload, storage, on-demand indexing and AI evidence", async () => {
    const response = await request(app).post("/api/files")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .attach("files", await createTextPdf(["", "Monthly income USD 7500", "", "Prepayment fee USD 25", ""]), {
        filename: "loan-pages.pdf", contentType: "application/pdf",
      }).expect(201);
    const uploaded = response.body.files[0];
    expect(uploaded.status).toBe("processed");
    expect(uploaded.extractedPageCount).toBe(5);
    const details = await request(app).get(`/api/files/${uploaded.id}`).set("Cookie", cookie).expect(200);
    expect(details.body.file.extractedText.split("\f")).toHaveLength(5);
    expect(details.body.file.extractedPageCount).toBe(5);
    const file = await WorkspaceFileModel.findById(uploaded.id).orFail();
    // Grounding must retain page numbers when it refreshes the upload's index.
    const grounding = await buildAiFinanceGrounding({ orgId: file.orgId, userId: file.userId,
      selectedWorkspaceFileIds: [uploaded.id], retrievalQuery: "prepayment fee" });
    const evidence = grounding.evidence.filter((item) => item.type === "retrieval_chunk");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.label).toContain("page 4");
    expect(evidence[0]?.page_number).toBe(4);
    expect(evidence[0]?.snippet).toContain("Prepayment fee USD 25");
    expect((await WorkspaceKnowledgeChunkModel.find({ workspaceFileId: file._id }).sort({ chunkIndex: 1 }).lean())
      .map((chunk) => chunk.pageNumber)).toEqual([2, 4]);
  });

  it("returns a usable PDF download URL with the right parameter and ownership checks", async () => {
    const rendered = await request(app).post("/api/files/render-pdf")
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ title: "QA report", prompt_text: "Income USD 7500. Monthly expenses USD 3000." })
      .expect(201);
    const path = rendered.body.pdf.download_path;
    expect(path).toBe(`/api/files/rendered/${rendered.body.pdf.file_id}/download`);
    const downloaded = await request(app).get(path).set("Cookie", cookie).expect(200);
    expect(downloaded.headers["content-type"]).toContain("application/pdf");
    expect(downloaded.headers["cache-control"]).toContain("no-store");
    expect(downloaded.body.subarray(0, 5).toString()).toBe("%PDF-");
    const foreign = await createAuthedUser();
    await request(app).get(path).set("Cookie", foreign.cookie).expect(404);
    await request(app).get("/api/files/rendered/invalid/download").set("Cookie", cookie).expect(400);
  });

  it("indexes a long uploaded document and removes its evidence on deletion", async () => {
    const response = await upload();
    const fileId = response.body.files[0].id;
    expect(await WorkspaceKnowledgeChunkModel.countDocuments({ workspaceFileId: fileId })).toBeGreaterThan(1);
    await request(app).delete(`/api/files/${fileId}`)
      .set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).expect(200);
    expect(await WorkspaceKnowledgeChunkModel.countDocuments({ workspaceFileId: fileId })).toBe(0);
    await request(app).get(`/api/files/${fileId}`).set("Cookie", cookie).expect(404);
  });

  it("rejects deletion by another user and retains the owner's evidence", async () => {
    const response = await upload();
    const fileId = response.body.files[0].id;
    const foreign = await createAuthedUser();
    await request(app).delete(`/api/files/${fileId}`)
      .set("Cookie", [foreign.cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).expect(404);
    expect(await WorkspaceKnowledgeChunkModel.countDocuments({ workspaceFileId: fileId })).toBeGreaterThan(1);
  });
});
