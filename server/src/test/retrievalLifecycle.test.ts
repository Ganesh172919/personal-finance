import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import WorkspaceFileModel from "../models/workspaceFileModel";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import { deleteWorkspaceFileChunks, ensureWorkspaceFileChunks, retrieveRelevantWorkspaceChunks } from "../services/retrievalService";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const objectId = () => new mongoose.Types.ObjectId();
const owner = { orgId: objectId(), userId: objectId() };

const createSource = async (scope = owner, text = "Loan prepayment penalty is 2 percent of the outstanding balance.") => {
  const file = await WorkspaceFileModel.create({
    ...scope, fileId: objectId(), originalName: "loan.txt", mimeType: "text/plain",
    kind: "document", sizeBytes: text.length, extractedText: text, status: "processed",
  });
  return { ...scope, workspaceFileId: file._id, fileId: file.fileId,
    originalName: file.originalName, sourceKind: file.kind, extractedText: text };
};

describe("workspace retrieval lifecycle", () => {
  beforeAll(async () => {
    await startTestDb();
    await WorkspaceKnowledgeChunkModel.init();
  }, 60_000);
  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("indexes concurrent requests idempotently and repairs partial writes", async () => {
    const source = await createSource(owner, "Loan repayment schedule. ".repeat(300));
    const results = await Promise.all(Array.from({ length: 4 }, () => ensureWorkspaceFileChunks(source)));
    const count = results[0]!.created;
    expect(count).toBeGreaterThan(1);
    expect(await WorkspaceKnowledgeChunkModel.countDocuments(owner)).toBe(count);
    expect(results.slice(1).every((result) => result.existing === count)).toBe(true);

    await WorkspaceKnowledgeChunkModel.deleteOne({ ...owner, workspaceFileId: source.workspaceFileId, chunkIndex: 1 });
    await ensureWorkspaceFileChunks(source);
    expect(await WorkspaceKnowledgeChunkModel.countDocuments(owner)).toBe(count);
  });

  it("refreshes changed text, removes old tail chunks and clears stale page metadata", async () => {
    const source = await createSource(owner, "# OLD TERMS\n" + "prepayment ".repeat(400) + "\fOld second page");
    await ensureWorkspaceFileChunks(source);
    await ensureWorkspaceFileChunks({ ...source, extractedText: "Updated repayment schedule." });
    const chunks = await WorkspaceKnowledgeChunkModel.find(owner).lean();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe("Updated repayment schedule.");
    expect(chunks[0]?.pageNumber).toBeUndefined();
    expect(chunks[0]?.sectionTitle).toBeUndefined();
    await ensureWorkspaceFileChunks({ ...source, extractedText: "" });
    expect(await WorkspaceKnowledgeChunkModel.countDocuments(owner)).toBe(0);
  });

  it("retrieves relevant finance clauses without leaking another org, user, or deleted file", async () => {
    const own = await createSource();
    const unrelated = await createSource(owner, "The monthly grocery budget is 500.");
    const foreignOrg = await createSource({ ...owner, orgId: objectId() });
    const foreignUser = await createSource({ ...owner, userId: objectId() });
    const deleted = await createSource();
    for (const source of [own, unrelated, foreignOrg, foreignUser, deleted]) await ensureWorkspaceFileChunks(source);
    await WorkspaceFileModel.deleteOne({ ...owner, _id: deleted.workspaceFileId });

    const chunks = await retrieveRelevantWorkspaceChunks({ ...owner, query: "What does the uploaded file say about prepayment penalties?" });
    expect(chunks.map((chunk) => chunk.workspaceFileId)).toEqual([String(own.workspaceFileId)]);
    expect(chunks[0]?.metadata?.file_name).toBe("loan.txt");
    expect(chunks[0]?.pageNumber).toBeUndefined();
  });

  it("keeps explicit selections scoped and does not widen an invalid selection", async () => {
    const first = await createSource();
    const second = await createSource();
    await ensureWorkspaceFileChunks(first);
    await ensureWorkspaceFileChunks(second);
    const chunks = await retrieveRelevantWorkspaceChunks({
      ...owner, query: "prepayment", selectedWorkspaceFileIds: [String(second.workspaceFileId)],
    });
    expect(chunks.map((chunk) => chunk.workspaceFileId)).toEqual([String(second.workspaceFileId)]);
    expect(await retrieveRelevantWorkspaceChunks({
      ...owner, query: "prepayment", selectedWorkspaceFileIds: ["invalid"],
    })).toEqual([]);
  });

  it("deletes only chunks belonging to the requested file and owner", async () => {
    const first = await createSource();
    const second = await createSource();
    await ensureWorkspaceFileChunks(first);
    await ensureWorkspaceFileChunks(second);
    await deleteWorkspaceFileChunks({ ...owner, userId: objectId(), workspaceFileId: first.workspaceFileId });
    expect(await WorkspaceKnowledgeChunkModel.countDocuments(owner)).toBe(2);
    await deleteWorkspaceFileChunks({ ...owner, workspaceFileId: first.workspaceFileId });
    const remaining = await WorkspaceKnowledgeChunkModel.find(owner).lean();
    expect(remaining.map((chunk) => String(chunk.workspaceFileId))).toEqual([String(second.workspaceFileId)]);
  });
});
