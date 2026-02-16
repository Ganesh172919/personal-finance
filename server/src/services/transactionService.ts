import type { Types } from "mongoose";
import TransactionModel from "../models/transactionModel";
import { ensureUserTransactionsMigrated } from "./transactionMigration";

export type AiTransaction = {
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: "income" | "expense" | "investment";
};

export type AiTransactionFetchResult = {
  transactions: AiTransaction[];
  stats: {
    totalTransactions: number;
    sentTransactions: number;
    droppedTransactions: number;
  };
};

export const fetchTransactionsForAi = async (params: {
  userId: Types.ObjectId;
  maxAgeDays?: number;
  maxItems?: number;
}): Promise<AiTransactionFetchResult> => {
  const maxAgeDays = params.maxAgeDays ?? 365;
  const maxItems = params.maxItems ?? 300;

  await ensureUserTransactionsMigrated(params.userId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const filter = { userId: params.userId, date: { $gte: cutoff } };

  const [totalTransactions, docs] = await Promise.all([
    TransactionModel.countDocuments(filter),
    TransactionModel.find(filter)
      .sort({ date: -1 })
      .limit(maxItems)
      .select({ amount: 1, category: 1, description: 1, date: 1, type: 1 })
      .lean()
  ]);

  const reversed = [...docs].reverse();

  return {
    transactions: reversed.map(doc => ({
      amount: Number(doc.amount) || 0,
      category: String(doc.category || "Other"),
      description: String(doc.description || ""),
      date: doc.date instanceof Date ? doc.date : new Date(doc.date as unknown as string),
      type: doc.type as "income" | "expense" | "investment"
    })),
    stats: {
      totalTransactions,
      sentTransactions: reversed.length,
      droppedTransactions: Math.max(0, totalTransactions - reversed.length)
    }
  };
};

