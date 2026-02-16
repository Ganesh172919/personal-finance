import type { Types } from "mongoose";
import FinancialProfileModel, {
  IFinancialProfileDocument,
  ITransaction
} from "../models/financialProfileModel";
import TransactionModel, { TransactionType } from "../models/transactionModel";

type MigrationResult = {
  migrated: boolean;
  embeddedCount: number;
  insertedAttempted: number;
  totalTransactions: number;
};

const toTransactionType = (value: unknown): TransactionType => {
  if (value === "income" || value === "expense" || value === "investment") {
    return value;
  }
  return "expense";
};

const mapLegacyTransaction = (userId: Types.ObjectId, tx: ITransaction) => ({
  userId,
  amount: Number(tx.amount) || 0,
  category: String(tx.category || "Other"),
  description: String(tx.description || ""),
  date: tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string),
  type: toTransactionType(tx.type),
  legacyId: tx._id
});

const isDuplicateKeyError = (error: unknown) => {
  const err = error as any;
  return err?.code === 11000 || (Array.isArray(err?.writeErrors) && err.writeErrors.some((e: any) => e?.code === 11000));
};

/**
 * Migrates embedded FinancialProfile.transactions into the Transaction collection for a single profile.
 * Safe to call repeatedly (legacyId unique sparse index + ordered:false insertMany).
 */
export const ensureProfileTransactionsMigrated = async (
  profile: IFinancialProfileDocument
): Promise<MigrationResult> => {
  const embedded = Array.isArray(profile.transactions) ? (profile.transactions as ITransaction[]) : [];
  const embeddedCount = embedded.length;

  // Consider "migrated" if the embedded array is empty OR explicit marker exists.
  if (profile.transactionsMigratedAt || embeddedCount === 0) {
    const totalTransactions = await TransactionModel.countDocuments({ userId: profile.userId });
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
  const docs = embedded.map(tx => mapLegacyTransaction(profile.userId, tx));

  try {
    if (docs.length > 0) {
      await TransactionModel.insertMany(docs, { ordered: false });
    }
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const totalTransactions = await TransactionModel.countDocuments({ userId: profile.userId });
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

export const ensureUserTransactionsMigrated = async (userId: Types.ObjectId): Promise<MigrationResult | null> => {
  const profile = await FinancialProfileModel.findOne({ userId });
  if (!profile) {
    return null;
  }
  return ensureProfileTransactionsMigrated(profile);
};

