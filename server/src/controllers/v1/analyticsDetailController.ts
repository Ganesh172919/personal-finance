import type { Request, Response } from "express";
import mongoose from "mongoose";

import TransactionModel from "../../models/transactionModel";
import AccountModel from "../../models/accountModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

// ─── Helpers ────────────────────────────────────────────

const requireContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }
  return {
    orgId: new mongoose.Types.ObjectId(req.org.orgId),
    userId: user._id,
  };
};

// ─── Spending Heatmap ───────────────────────────────────
// Returns daily spending totals for a date range (default: last 365 days)
export const getSpendingHeatmap = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const daysBack = Math.min(
    Number(req.query?.days_back) || 365,
    730
  );
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  since.setHours(0, 0, 0, 0);

  const pipeline = [
    {
      $match: {
        orgId,
        userId,
        type: "expense",
        date: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$date" },
        },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  const results = await TransactionModel.aggregate(pipeline);

  res.json({
    org_id: orgId.toString(),
    days_back: daysBack,
    data: results.map((r: any) => ({
      date: r._id,
      total: Math.abs(r.total),
      count: r.count,
    })),
    request_id: req.requestId,
  });
};

// ─── Category Trends ────────────────────────────────────
// Returns monthly totals per category for the last N months
export const getCategoryTrends = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const months = Math.min(Number(req.query?.months) || 12, 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const pipeline = [
    {
      $match: {
        orgId,
        userId,
        type: "expense",
        date: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$date" } },
          category: "$category",
        },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.month": 1 as const } },
  ];

  const results = await TransactionModel.aggregate(pipeline);

  // Reshape into { month, categories: { category: total } }
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of results) {
    const month = r._id.month;
    if (!monthMap.has(month)) monthMap.set(month, {});
    monthMap.get(month)![r._id.category] = Math.abs(r.total);
  }

  const data = Array.from(monthMap.entries()).map(([month, categories]) => ({
    month,
    categories,
    total: Object.values(categories).reduce((a, b) => a + b, 0),
  }));

  res.json({
    org_id: orgId.toString(),
    months,
    data,
    request_id: req.requestId,
  });
};

// ─── Income vs Expense Summary ──────────────────────────
// Returns monthly income vs expense totals + savings rate
export const getIncomeExpenseSummary = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const months = Math.min(Number(req.query?.months) || 12, 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const pipeline = [
    {
      $match: {
        orgId,
        userId,
        date: { $gte: since },
        type: { $in: ["income", "expense"] },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$date" } },
          type: "$type",
        },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.month": 1 as const } },
  ];

  const results = await TransactionModel.aggregate(pipeline);

  const monthMap = new Map<string, { income: number; expense: number }>();
  for (const r of results) {
    const month = r._id.month;
    if (!monthMap.has(month)) monthMap.set(month, { income: 0, expense: 0 });
    const entry = monthMap.get(month)!;
    if (r._id.type === "income") entry.income = Math.abs(r.total);
    else entry.expense = Math.abs(r.total);
  }

  const data = Array.from(monthMap.entries()).map(([month, { income, expense }]) => ({
    month,
    income,
    expense,
    net: income - expense,
    savings_rate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
  }));

  res.json({
    org_id: orgId.toString(),
    months,
    data,
    request_id: req.requestId,
  });
};

// ─── Account Balances Snapshot ───────────────────────────
// Returns computed "balance" per account from transaction totals
export const getAccountBalances = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const accounts = await AccountModel.find({ orgId, status: "active" }).lean();

  const pipeline = [
    {
      $match: { orgId, userId, accountId: { $exists: true, $ne: null } },
    },
    {
      $group: {
        _id: "$accountId",
        balance: {
          $sum: {
            $cond: [{ $eq: ["$type", "income"] }, "$amount", { $multiply: ["$amount", -1] }],
          },
        },
        transaction_count: { $sum: 1 },
        last_transaction: { $max: "$date" },
      },
    },
  ];

  const balances = await TransactionModel.aggregate(pipeline);
  const balanceMap = new Map<string, any>();
  for (const b of balances) {
    balanceMap.set(String(b._id), b);
  }

  const data = accounts.map((account: any) => {
    const bal = balanceMap.get(String(account._id));
    return {
      id: String(account._id),
      name: account.name,
      type: account.type,
      institution: account.institution || null,
      currency: account.currency,
      balance: bal?.balance ?? 0,
      transaction_count: bal?.transaction_count ?? 0,
      last_transaction: bal?.last_transaction ?? null,
    };
  });

  const totalAssets = data
    .filter((a) => a.type !== "credit")
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const totalLiabilities = data
    .filter((a) => a.type === "credit")
    .reduce((sum, a) => sum + Math.abs(Math.min(0, a.balance)), 0);

  res.json({
    org_id: orgId.toString(),
    accounts: data,
    summary: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: totalAssets - totalLiabilities,
    },
    request_id: req.requestId,
  });
};

// ─── Top Merchants ──────────────────────────────────────
// Returns top N merchants by spending amount
export const getTopMerchants = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const limit = Math.min(Number(req.query?.limit) || 10, 50);
  const months = Math.min(Number(req.query?.months) || 6, 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const pipeline = [
    {
      $match: {
        orgId,
        userId,
        type: "expense",
        date: { $gte: since },
        merchantId: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$merchantId",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        avg: { $avg: "$amount" },
      },
    },
    { $sort: { total: 1 as const } }, // expenses are negative, so ascending = most spent
    { $limit: limit },
    {
      $lookup: {
        from: "merchants",
        localField: "_id",
        foreignField: "_id",
        as: "merchant",
      },
    },
    { $unwind: { path: "$merchant", preserveNullAndEmptyArrays: true } },
  ];

  const results = await TransactionModel.aggregate(pipeline);

  res.json({
    org_id: orgId.toString(),
    months,
    merchants: results.map((r: any) => ({
      merchant_id: String(r._id),
      name: r.merchant?.name || "Unknown",
      total: Math.abs(r.total),
      count: r.count,
      avg: Math.abs(r.avg),
    })),
    request_id: req.requestId,
  });
};
