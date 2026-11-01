import TransactionModel from "../models/transactionModel";

/** Replace the legacy sparse compound index without removing any records. */
export async function ensureTransactionExternalIdIndex(): Promise<void> {
  await TransactionModel.collection.createIndex({ orgId: 1, externalId: 1 }, {
    name: "org_external_id_unique",
    unique: true,
    partialFilterExpression: { externalId: { $type: "string" } },
  });
  const indexes = await TransactionModel.collection.indexes();
  const legacy = indexes.find(index => index.name === "orgId_1_externalId_1" && index.unique && index.sparse);
  // Build the replacement before dropping the legacy index. Import IDs remain
  // unique throughout, while transactions with no external ID are unrestricted.
  if (legacy?.name) await TransactionModel.collection.dropIndex(legacy.name);
}
