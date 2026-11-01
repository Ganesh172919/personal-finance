/**
 * @fileoverview Analytics Detail Controller (v1)
 *
 * Detailed financial analytics endpoints: spending heatmap, category trends,
 * income vs. expense summaries, account balances, and top merchants.
 * All endpoints use MongoDB aggregation pipelines for efficient computation.
 *
 * Routes served:
 *   GET /api/v1/analytics/spending-heatmap    - getSpendingHeatmap
 *   GET /api/v1/analytics/category-trends     - getCategoryTrends
 *   GET /api/v1/analytics/income-expense      - getIncomeExpenseSummary
 *   GET /api/v1/analytics/account-balances    - getAccountBalances
 *   GET /api/v1/analytics/top-merchants       - getTopMerchants
 *
 * Key patterns:
 *   - All endpoints scoped to org + authenticated user
 *   - Aggregation pipelines compute summaries server-side (not in JS)
 *   - Spending amounts stored as negative; absolute values returned to client
 *   - Date ranges clamped to prevent excessive data scans
 *
 * @module controllers/v1/analyticsDetailController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import TransactionModel from "../../models/transactionModel";
import AccountModel from "../../models/accountModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import {
  convertUsdToCurrency,
  normalizeCurrency,
  FX_RATES_TO_USD,
  CURRENCY_SYMBOLS,
  type SupportedCurrency,
} from "../../utils/currencyFx";

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
  const targetCurrency = normalizeCurrency(typeof req.query.currency === "string" ? req.query.currency : undefined);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

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
        total: { $sum: { $abs: "$amount" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  const results = await TransactionModel.aggregate(pipeline);

  res.json({
    org_id: orgId.toString(),
    days_back: daysBack,
    currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    data: results.map((r: any) => ({
      date: r._id,
      total: convertUsdToCurrency(Math.abs(r.total), targetCurrency),
      count: r.count,
    })),
    request_id: req.requestId,
  });
};

// ─── Category Trends ────────────────────────────────────
// Returns monthly totals per category for the last N months
export const getCategoryTrends = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const targetCurrency = normalizeCurrency(typeof req.query.currency === "string" ? req.query.currency : undefined);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

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
        total: { $sum: { $abs: "$amount" } },
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
    monthMap.get(month)![r._id.category] = convertUsdToCurrency(Math.abs(r.total), targetCurrency);
  }

  const data = Array.from(monthMap.entries()).map(([month, categories]) => {
    const total = Object.values(categories).reduce((a, b) => a + b, 0);
    return {
      month,
      categories,
      total: targetCurrency === "JPY" ? Math.round(total) : Math.round(total * 100) / 100,
    };
  });

  res.json({
    org_id: orgId.toString(),
    months,
    currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    data,
    request_id: req.requestId,
  });
};

// ─── Income vs Expense Summary ──────────────────────────
// Returns monthly income vs expense totals + savings rate
export const getIncomeExpenseSummary = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const targetCurrency = normalizeCurrency(typeof req.query.currency === "string" ? req.query.currency : undefined);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

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
        total: { $sum: { $abs: "$amount" } },
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

  const data = Array.from(monthMap.entries()).map(([month, { income, expense }]) => {
    const convertedIncome = convertUsdToCurrency(income, targetCurrency);
    const convertedExpense = convertUsdToCurrency(expense, targetCurrency);
    const convertedNet = convertedIncome - convertedExpense;
    return {
      month,
      income: convertedIncome,
      expense: convertedExpense,
      net: targetCurrency === "JPY" ? Math.round(convertedNet) : Math.round(convertedNet * 100) / 100,
      savings_rate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
    };
  });

  res.json({
    org_id: orgId.toString(),
    months,
    currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    data,
    request_id: req.requestId,
  });
};

// ─── Account Balances Snapshot ───────────────────────────
// Returns computed "balance" per account from transaction totals
export const getAccountBalances = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const requestedCurrency = typeof req.query.currency === "string" ? req.query.currency : undefined;
  const isExplicitFx = Boolean(requestedCurrency);
  const targetCurrency = normalizeCurrency(requestedCurrency);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

  const accounts = await AccountModel.find({ orgId, status: "active" }).lean();

  const pipeline = [
    {
      $match: { orgId, userId, accountId: { $exists: true, $ne: null } },
    },
    {
      $group: {
        _id: "$accountId",
        // Transactions already carry their ledger sign (expenses/investments
        // are negative). Negating them again incorrectly increases assets.
        balance: { $sum: "$amount" },
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
    const rawBalance = Number(account.openingBalance || 0) + Number(bal?.balance || 0);
    return {
      id: String(account._id),
      name: account.name,
      type: account.type,
      institution: account.institution || null,
      currency: isExplicitFx ? targetCurrency : account.currency,
      original_currency: account.currency,
      balance: isExplicitFx ? convertUsdToCurrency(rawBalance, targetCurrency) : rawBalance,
      raw_balance: rawBalance,
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
    currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    accounts: data,
    summary: {
      total_assets: targetCurrency === "JPY" ? Math.round(totalAssets) : Math.round(totalAssets * 100) / 100,
      total_liabilities: targetCurrency === "JPY" ? Math.round(totalLiabilities) : Math.round(totalLiabilities * 100) / 100,
      net_worth: targetCurrency === "JPY" ? Math.round(totalAssets - totalLiabilities) : Math.round((totalAssets - totalLiabilities) * 100) / 100,
    },
    request_id: req.requestId,
  });
};

// ─── Top Merchants ──────────────────────────────────────
// Returns top N merchants by spending amount
export const getTopMerchants = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const targetCurrency = normalizeCurrency(typeof req.query.currency === "string" ? req.query.currency : undefined);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

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
        total: { $sum: { $abs: "$amount" } },
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
    currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    merchants: results.map((r: any) => ({
      merchant_id: String(r._id),
      name: r.merchant?.name || "Unknown",
      total: convertUsdToCurrency(Math.abs(r.total), targetCurrency),
      count: r.count,
      avg: convertUsdToCurrency(Math.abs(r.avg), targetCurrency),
    })),
    request_id: req.requestId,
  });
};

// ─── Multi-Currency Summary & FX Rates Matrix ────────────
// Returns converted net worth and multi-currency conversion table across 7 global currencies
export const getMultiCurrencySummary = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const targetCurrency = normalizeCurrency(typeof req.query.currency === "string" ? req.query.currency : undefined);
  const fxRate = FX_RATES_TO_USD[targetCurrency];
  const symbol = CURRENCY_SYMBOLS[targetCurrency];

  const accounts = await AccountModel.find({ orgId, status: "active" }).lean();
  const pipeline = [
    { $match: { orgId, userId, accountId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$accountId",
        balance: { $sum: "$amount" },
      },
    },
  ];
  const balances = await TransactionModel.aggregate(pipeline);
  const balanceMap = new Map<string, number>();
  for (const b of balances) {
    balanceMap.set(String(b._id), Number(b.balance || 0));
  }

  let baseAssetsUsd = 0;
  let baseLiabilitiesUsd = 0;
  for (const account of accounts) {
    const bal = Number(account.openingBalance || 0) + (balanceMap.get(String(account._id)) || 0);
    if (account.type === "credit") {
      baseLiabilitiesUsd += Math.abs(Math.min(0, bal));
    } else {
      baseAssetsUsd += Math.max(0, bal);
    }
  }
  const baseNetWorthUsd = baseAssetsUsd - baseLiabilitiesUsd;

  const currencies: SupportedCurrency[] = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"];
  const currencyBreakdown = currencies.map((curr) => {
    const rate = FX_RATES_TO_USD[curr];
    const sym = CURRENCY_SYMBOLS[curr];
    return {
      currency: curr,
      symbol: sym,
      fx_rate: rate,
      net_worth_localized: convertUsdToCurrency(baseNetWorthUsd, curr),
      assets_localized: convertUsdToCurrency(baseAssetsUsd, curr),
      liabilities_localized: convertUsdToCurrency(baseLiabilitiesUsd, curr),
    };
  });

  res.json({
    org_id: orgId.toString(),
    base_currency: "USD",
    target_currency: targetCurrency,
    fx_rate: fxRate,
    currency_symbol: symbol,
    base_summary: {
      total_assets: Math.round(baseAssetsUsd * 100) / 100,
      total_liabilities: Math.round(baseLiabilitiesUsd * 100) / 100,
      net_worth: Math.round(baseNetWorthUsd * 100) / 100,
    },
    converted_summary: {
      total_assets: convertUsdToCurrency(baseAssetsUsd, targetCurrency),
      total_liabilities: convertUsdToCurrency(baseLiabilitiesUsd, targetCurrency),
      net_worth: convertUsdToCurrency(baseNetWorthUsd, targetCurrency),
    },
    rates_table: currencyBreakdown,
    request_id: req.requestId,
  });
};
