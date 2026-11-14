import type { Types } from "mongoose";
import FinancialProfileModel, {
  IFinancialProfileDocument,
  ITransaction
} from "../models/financialProfileModel";
import TransactionModel, { TransactionType } from "../models/transactionModel";

// Encapsulates the quantitative outcome of a profile transaction migration.
// Tracks embedded legacy counts, newly attempted insertions, and final totals.
// Indicates whether an active data migration execution was performed.
type MigrationResult = {
  migrated: boolean;
  embeddedCount: number;
  insertedAttempted: number;
  totalTransactions: number;
};

// Normalizes legacy transaction string values into typed transaction categories.
// Validates whether the input matches income, expense, or investment types.
// Defaults unrecognized legacy category values to standard expense items.
const toTransactionType = (value: unknown): TransactionType => {
  if (value === "income" || value === "expense" || value === "investment") {
    return value;
  }
  return "expense";
};

// Transforms embedded legacy profile transaction subdocuments into collection models.
// Associates tenant organization and user identifiers with each migrated record.
// Retains historical legacy identifiers to ensure migration idempotency.
const mapLegacyTransaction = (params: { orgId: Types.ObjectId; userId: Types.ObjectId }, tx: ITransaction) => ({
  orgId: params.orgId,
  userId: params.userId,
  amount: Number(tx.amount) || 0,
  category: String(tx.category || "Other"),
  description: String(tx.description || ""),
  date: tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string),
  type: toTransactionType(tx.type),
  legacyId: tx._id
});

// Inspects an error to determine if it represents a MongoDB duplicate key collision.
// Evaluates both top-level error codes and writeErrors collection structures.
// Allows unordered bulk inserts to continue gracefully when records already exist.
const isDuplicateKeyError = (error: unknown) => {
  const err = error as any;
  return err?.code === 11000 || (Array.isArray(err?.writeErrors) && err.writeErrors.some((e: any) => e?.code === 11000));
};

/**
 * Migrates embedded FinancialProfile.transactions into the Transaction collection for a single profile.
 * Safe to call repeatedly (legacyId unique sparse index + ordered:false insertMany).
 */
// Migrates embedded profile transactions into the standalone transaction collection.
// Performs unordered bulk inserts ignoring duplicate legacy transaction keys.
// Empties legacy embedded arrays and marks migration timestamps upon success.
export const ensureProfileTransactionsMigrated = async (
  profile: IFinancialProfileDocument
): Promise<MigrationResult> => {
  const embedded = Array.isArray(profile.transactions) ? (profile.transactions as ITransaction[]) : [];
  const embeddedCount = embedded.length;

  // Consider "migrated" if the embedded array is empty OR explicit marker exists.
  if (profile.transactionsMigratedAt || embeddedCount === 0) {
    const totalTransactions = await TransactionModel.countDocuments({ orgId: profile.orgId, userId: profile.userId });
    if (profile.transactionsCount !== totalTransactions) {
      profile.transactionsCount = totalTransactions;
      if (!profile.transactionsUpdatedAt) {
        profile.transactionsUpdatedAt = profile.updatedAt;
      }
      await profile.save();
    }
    return {
      migrated: false,
      embeddedCount,
      insertedAttempted: 0,
      totalTransactions
    };
  }

  const now = new Date();
  const docs = embedded.map(tx => mapLegacyTransaction({ orgId: profile.orgId, userId: profile.userId }, tx));

  try {
    if (docs.length > 0) {
      await TransactionModel.insertMany(docs, { ordered: false });
    }
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const totalTransactions = await TransactionModel.countDocuments({ orgId: profile.orgId, userId: profile.userId });
  profile.transactions = [];
  profile.transactionsCount = totalTransactions;
  profile.transactionsUpdatedAt = now;
  profile.transactionsMigratedAt = now;
  await profile.save();

  return {
    migrated: true,
    embeddedCount,
    insertedAttempted: docs.length,
    totalTransactions
  };
};

// Resolves a user financial profile and coordinates legacy transaction migration.
// Queries the database by tenant organization and user identifier scope.
// Returns migration statistics or null if no financial profile exists.
export const ensureUserTransactionsMigrated = async (params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<MigrationResult | null> => {
  const profile = await FinancialProfileModel.findOne({ orgId: params.orgId, userId: params.userId });
  if (!profile) {
    return null;
  }
  return ensureProfileTransactionsMigrated(profile);
};
