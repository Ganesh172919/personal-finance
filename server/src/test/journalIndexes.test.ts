import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import JournalEntryModel from "../models/journalEntryModel";
import { ensureJournalClientDraftIndex } from "../services/journalIndexes";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("journal entry clientDraftId indexes", () => {
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const recognized = { orgId, userId, recognizedText: "handwritten note", confidence: {}, parsedIntent: {} };

  beforeAll(async () => {
    await startTestDb();
    await JournalEntryModel.init();
  });
  beforeEach(clearTestDb);
  afterAll(stopTestDb);

  it("allows many recognized entries without a draft id while deduplicating offline drafts", async () => {
    await JournalEntryModel.create([recognized, recognized, recognized]);
    await JournalEntryModel.create({ ...recognized, clientDraftId: "offline-1" });
    await expect(JournalEntryModel.create({ ...recognized, clientDraftId: "offline-1" })).rejects.toMatchObject({ code: 11000 });
    await JournalEntryModel.create({ ...recognized, userId: new mongoose.Types.ObjectId(), clientDraftId: "offline-1" });
    expect(await JournalEntryModel.countDocuments({ orgId, userId })).toBe(4);
  });

  it("upgrades the legacy sparse index idempotently without losing records", async () => {
    await JournalEntryModel.collection.dropIndex("org_user_client_draft_unique");
    await JournalEntryModel.collection.createIndex({ orgId: 1, userId: 1, clientDraftId: 1 }, { unique: true, sparse: true });
    const first = await JournalEntryModel.create(recognized);
    await expect(JournalEntryModel.create(recognized)).rejects.toMatchObject({ code: 11000 });

    await ensureJournalClientDraftIndex();
    await ensureJournalClientDraftIndex();
    await JournalEntryModel.create(recognized);
    expect(await JournalEntryModel.findOne({ _id: first._id, orgId })).toBeTruthy();
    expect(await JournalEntryModel.countDocuments({ orgId, userId })).toBe(2);
    const indexes = await JournalEntryModel.collection.indexes();
    expect(indexes.some(index => index.name === "orgId_1_userId_1_clientDraftId_1")).toBe(false);
    expect(indexes.find(index => index.name === "org_user_client_draft_unique")).toMatchObject({
      unique: true,
      partialFilterExpression: { clientDraftId: { $type: "string" } },
    });
  });
});
