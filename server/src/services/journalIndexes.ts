import JournalEntryModel from "../models/journalEntryModel";

/**
 * Replace the legacy sparse unique clientDraftId index without removing any records.
 * The legacy index treated every entry without a draft id as `clientDraftId: null`,
 * so a user's second handwriting recognition failed with a duplicate-key error.
 */
// Replaces the legacy sparse draft index with a partial unique index.
// Eliminates duplicate key collisions when records omit client draft identifiers.
// Builds the replacement index prior to dropping legacy definitions safely.
export async function ensureJournalClientDraftIndex(): Promise<void> {
  await JournalEntryModel.collection.createIndex({ orgId: 1, userId: 1, clientDraftId: 1 }, {
    name: "org_user_client_draft_unique",
    unique: true,
    partialFilterExpression: { clientDraftId: { $type: "string" } },
  });
  const indexes = await JournalEntryModel.collection.indexes();
  const legacy = indexes.find(
    index => index.name === "orgId_1_userId_1_clientDraftId_1" && index.unique && index.sparse
  );
  // The replacement is built first so offline-draft deduplication stays enforced throughout.
  if (legacy?.name) await JournalEntryModel.collection.dropIndex(legacy.name);
}
