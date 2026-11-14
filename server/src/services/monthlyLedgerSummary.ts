import type { Types } from "mongoose";
import TransactionModel from "../models/transactionModel";

type LedgerScope = { orgId: Types.ObjectId; userId?: Types.ObjectId } | { userId: Types.ObjectId };

type SpendingPeriod = "current" | "previous";

export async function getMonthlyLedgerSummary(scope: LedgerScope, period: SpendingPeriod = "current") {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - (period === "previous" ? 1 : 0);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const [summary] = await TransactionModel.aggregate<{
    totals: Array<{ _id: string; amount: number; count: number }>;
    categories: Array<{ _id: string; amount: number }>;
  }>([
    { $match: { ...scope, date: { $gte: start, $lt: end, $lte: now } } },
    { $facet: {
      totals: [
        { $group: { _id: "$type", amount: { $sum: { $abs: "$amount" } }, count: { $sum: 1 } } },
      ],
      categories: [
        { $match: { type: "expense" } },
        { $group: { _id: { $ifNull: ["$category", "Uncategorized"] }, amount: { $sum: { $abs: "$amount" } } } },
        { $sort: { amount: -1, _id: 1 } },
        { $limit: 1 },
      ],
    } },
  ]);
  const expense = summary?.totals.find(row => row._id === "expense");
  const income = summary?.totals.find(row => row._id === "income");
  return {
    month: start,
    totalSpent: expense?.amount ?? 0,
    totalIncome: income?.amount ?? 0,
    transactionCount: summary?.totals.reduce((sum, row) => sum + row.count, 0) ?? 0,
    topCategory: summary?.categories[0] ?? null,
  };
}

export function getMonthlySpendingPeriod(input: string): SpendingPeriod | null {
  const question = input.trim().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  const period = question.match(/^(?:based only on (?:this|my) (?:test )?workspace,\s*)?(?:how much (?:did i spend|have i spent|i spent)|what (?:is|was|were) my (?:total )?(?:spending|expenses)|report my total (?:spending|expenses))(?: in total)? (?:for |in )?(this month|the current month|last month|the previous month)(?:,? and (?:which category had the most spending|what (?:is|was) my (?:top|highest) spending category|(?:my )?highest spending category))?$/i)?.[1]?.toLowerCase();
  if (!period) return null;
  return period === "last month" || period === "the previous month" ? "previous" : "current";
}

function relativeSpendingPeriod(input: string): SpendingPeriod | null {
  const question = input.trim().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  const month = question.match(/^(?:(?:and |(?:what|how) about )?(?:for |in )?)(this month|last month|the current month|the previous month)$/i)?.[1];
  if (!month) return null;
  return /previous|last/i.test(month) ? "previous" : "current";
}

export function getMonthlySpendingFollowUp(
  input: string,
  history: ReadonlyArray<{ role: string; content: string; hasAttachments: boolean }>,
): SpendingPeriod | null {
  const period = relativeSpendingPeriod(input);
  if (!period) return null;
  const recentQuestions = history.filter(({ role }) => role === "user").slice(-3);
  for (const question of recentQuestions.reverse()) {
    if (question.hasAttachments) break;
    if (getMonthlySpendingPeriod(question.content)) return period;
    if (!relativeSpendingPeriod(question.content)) break;
  }
  return null;
}
