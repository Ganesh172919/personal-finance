import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import TransactionModel from "../models/transactionModel";
import { ensureTransactionExternalIdIndex } from "../services/transactionIndexes";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("transaction external ID indexes", () => {
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const record = { orgId, userId, amount: 25, category: "Food", description: "Manual purchase", type: "expense", date: new Date() };

  beforeAll(async () => {
    await startTestDb();
    // Wait for indexes: otherwise tests can pass before uniqueness is enforced.
    await TransactionModel.init();
  });
  beforeEach(clearTestDb);
  afterAll(stopTestDb);

  it("allows multiple manual transactions while enforcing imported IDs per organization", async () => {
    await TransactionModel.create([record, record, { ...record, externalId: null }]);
    await TransactionModel.create({ ...record, externalId: "bank-001" });
    await expect(TransactionModel.create({ ...record, externalId: "bank-001" })).rejects.toMatchObject({ code: 11000 });
    await TransactionModel.create({ ...record, orgId: new mongoose.Types.ObjectId(), externalId: "bank-001" });
    expect(await TransactionModel.countDocuments({ orgId })).toBe(4);
  });

  it("upgrades the legacy sparse index idempotently without losing records", async () => {
    await TransactionModel.collection.dropIndex("org_external_id_unique");
    await TransactionModel.collection.createIndex({ orgId: 1, externalId: 1 }, { unique: true, sparse: true });
    const first = await TransactionModel.create(record);
    await expect(TransactionModel.create(record)).rejects.toMatchObject({ code: 11000 });

    await ensureTransactionExternalIdIndex();
    await ensureTransactionExternalIdIndex();
    await TransactionModel.create(record);
    expect(await TransactionModel.findOne({ _id: first._id, orgId })).toBeTruthy();
    expect(await TransactionModel.countDocuments({ orgId })).toBe(2);
    const indexes = await TransactionModel.collection.indexes();
    expect(indexes.some(index => index.name === "orgId_1_externalId_1")).toBe(false);
    expect(indexes.find(index => index.name === "org_external_id_unique")).toMatchObject({ unique: true, partialFilterExpression: { externalId: { $type: "string" } } });
  });
});
