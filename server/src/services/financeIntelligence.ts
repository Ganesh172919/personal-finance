import crypto from "crypto";
import mongoose from "mongoose";

import BudgetAllocationModel from "../models/budgetAllocationModel";
import MerchantModel from "../models/merchantModel";
import OrganizationModel from "../models/organizationModel";
import RecurringRuleModel from "../models/recurringRuleModel";
import TransactionModel from "../models/transactionModel";
import { cacheGet, cacheSet } from "../config/redis";

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

export const parsePeriodKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    throw new Error("Invalid period key (expected YYYY-MM)");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Invalid period key (expected YYYY-MM)");
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { year, month, start, end };
};

export type BudgetEnvelopeRow = {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  currency: string;
  tx_count: number;
  unbudgeted: boolean;
};

export type BudgetEnvelopesResult = {
  org_id: string;
  period_key: string;
  currency: string;
  totals: {
    planned: number;
    spent: number;
    remaining: number;
    unbudgeted_spent: number;
  };
  envelopes: BudgetEnvelopeRow[];
};

export const getBudgetEnvelopes = async (params: {
  orgId: mongoose.Types.ObjectId;
  periodKey: string;
}) : Promise<BudgetEnvelopesResult> => {
  const cacheKey = `env:${params.orgId.toString()}:${params.periodKey}`;
  const cached = await cacheGet<BudgetEnvelopesResult>(cacheKey);
  if (cached) return cached;

  const { start, end } = parsePeriodKey(params.periodKey);

  const org = await OrganizationModel.findById(params.orgId).select({ currency: 1 }).lean();
  const currency = String((org as any)?.currency || "USD");

  const allocations = await BudgetAllocationModel.find({ orgId: params.orgId, periodKey: params.periodKey })
    .select({ category: 1, amount: 1, currency: 1 })
    .lean();

  const spendingRows = await TransactionModel.aggregate([
    {
      $match: {
        orgId: params.orgId,
        date: { $gte: start, $lt: end },
        amount: { $lt: 0 },
      },
    },
    {
      $group: {
        _id: "$category",
        spent: { $sum: { $abs: "$amount" } },
        tx_count: { $sum: 1 },
      },
    },
  ]);

  const spentByCategory = new Map(
    spendingRows.map((row: any) => [
      String(row?._id || "Other"),
      {
        spent: Number(row?.spent || 0),
        tx_count: Number(row?.tx_count || 0),
      },
    ])
  );

  const envelopes: BudgetEnvelopeRow[] = [];

  for (const allocation of allocations as any[]) {
    const category = String(allocation.category || "Other");
    const planned = Math.max(0, Number(allocation.amount || 0));
    const match = spentByCategory.get(category) || { spent: 0, tx_count: 0 };
    spentByCategory.delete(category);

    const spent = Math.max(0, Number(match.spent || 0));
    const remaining = planned - spent;
    envelopes.push({
      category,
      planned,
      spent,
      remaining,
      currency: String(allocation.currency || currency),
      tx_count: Math.max(0, Number(match.tx_count || 0)),
      unbudgeted: false,
    });
  }

  for (const [category, match] of spentByCategory.entries()) {
    const spent = Math.max(0, Number(match.spent || 0));
    if (spent <= 0) continue;
    envelopes.push({
      category,
      planned: 0,
      spent,
      remaining: -spent,
      currency,
      tx_count: Math.max(0, Number(match.tx_count || 0)),
      unbudgeted: true,
    });
  }

  envelopes.sort((a, b) => {
    if (a.unbudgeted !== b.unbudgeted) return a.unbudgeted ? 1 : -1;
    const scoreA = a.unbudgeted ? a.spent : a.planned;
    const scoreB = b.unbudgeted ? b.spent : b.planned;
    return scoreB - scoreA;
  });

  const totals = envelopes.reduce(
    (acc, row) => {
      acc.planned += row.planned;
      acc.spent += row.spent;
      acc.remaining += row.remaining;
      if (row.unbudgeted) acc.unbudgeted_spent += row.spent;
      return acc;
    },
    { planned: 0, spent: 0, remaining: 0, unbudgeted_spent: 0 }
  );

  const result: BudgetEnvelopesResult = {
    org_id: params.orgId.toString(),
    period_key: params.periodKey,
    currency,
    totals: {
      planned: Math.round(totals.planned * 100) / 100,
      spent: Math.round(totals.spent * 100) / 100,
      remaining: Math.round(totals.remaining * 100) / 100,
      unbudgeted_spent: Math.round(totals.unbudgeted_spent * 100) / 100,
    },
    envelopes: envelopes.map((row) => ({
      ...row,
      planned: Math.round(row.planned * 100) / 100,
      spent: Math.round(row.spent * 100) / 100,
      remaining: Math.round(row.remaining * 100) / 100,
    })),
  };

  await cacheSet(cacheKey, result, 300); // 5 min TTL
  return result;
};

const normalizeRecurringKey = (value: string) => {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower) return "";

  const squashed = lower.replace(/\s+/g, " ");
  const noIds = squashed.replace(/\b\d{3,}\b/g, "");
  const stripped = noIds.replace(/[^a-z0-9 &./:-]+/g, "");
  return stripped.trim().slice(0, 160);
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const safeAbsMoney = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
};

const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export type RecurringCandidate = {
  candidate_id: string;
  cadence: "weekly" | "monthly";
  confidence: number;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  interval_days_median: number;
  amount_avg: number;
  amount_min: number;
  amount_max: number;
  amount_range_pct: number;
  category: string;
  merchant_id: string | null;
  merchant_name: string | null;
  description_sample: string;
  suggested_cron: string;
  suggested_rule: {
    name: string;
    cron: string;
    status: "active";
    merchant_id?: string;
    merchant_name?: string;
    category?: string;
    amount_min?: number;
    amount_max?: number;
  };
  rationale: string[];
};

export const detectRecurringCandidates = async (params: {
  orgId: mongoose.Types.ObjectId;
  daysBack?: number;
  limit?: number;
  minOccurrences?: number;
}) => {
  const daysBack = clampInt(params.daysBack, 365, 30, 730);
  const limit = clampInt(params.limit, 20, 1, 100);
  const minOccurrences = clampInt(params.minOccurrences, 3, 3, 24);

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const txRows = await TransactionModel.find({
    orgId: params.orgId,
    date: { $gte: cutoff },
    amount: { $lt: 0 },
  })
    .select({ date: 1, amount: 1, category: 1, description: 1, merchantId: 1 })
    .sort({ date: -1 })
    .limit(6000)
    .lean();

  const groups = new Map<
    string,
    Array<{ date: Date; amount: number; category: string; description: string; merchantId?: mongoose.Types.ObjectId }>
  >();

  for (const row of txRows as any[]) {
    const date = row?.date ? new Date(row.date) : null;
    if (!date || Number.isNaN(date.getTime())) continue;

    const description = String(row?.description || "").trim();
    const category = String(row?.category || "Other");
    const merchantId = row?.merchantId ? new mongoose.Types.ObjectId(String(row.merchantId)) : undefined;

    const key = merchantId ? `m:${merchantId.toString()}` : `d:${normalizeRecurringKey(description)}`;
    if (key.endsWith(":")) continue;

    const entry = {
      date,
      amount: -safeAbsMoney(row?.amount),
      category,
      description,
      merchantId,
    };

    const list = groups.get(key);
    if (list) {
      list.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const candidatesRaw: RecurringCandidate[] = [];

  for (const [key, rows] of groups.entries()) {
    if (rows.length < minOccurrences) continue;

    const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const dates = sorted.map((r) => r.date);
    const intervals = dates.slice(1).map((d, idx) => dayDiff(dates[idx]!, d));
    if (intervals.length < minOccurrences - 1) continue;

    const intervalMedian = median(intervals);

    const classifyCadence = (medianDays: number): "weekly" | "monthly" | null => {
      if (medianDays >= 6 && medianDays <= 8) return "weekly";
      if (medianDays >= 27 && medianDays <= 32) return "monthly";
      return null;
    };

    const cadence = classifyCadence(intervalMedian);
    if (!cadence) continue;

    const intervalTolerance = cadence === "monthly" ? 5 : 2;
    const intervalMatches = intervals.filter((d) => Math.abs(d - intervalMedian) <= intervalTolerance).length;
    const intervalMatchPct = intervals.length > 0 ? intervalMatches / intervals.length : 0;

    const amounts = sorted.map((r) => safeAbsMoney(r.amount));
    const amountAvg = amounts.reduce((a, b) => a + b, 0) / Math.max(1, amounts.length);
    const amountMin = Math.min(...amounts);
    const amountMax = Math.max(...amounts);
    const amountRangePct = amountAvg > 0 ? (amountMax - amountMin) / amountAvg : 1;

    const amountConsistency = 1 - Math.min(1, amountRangePct);
    const cadenceConsistency = intervalMatchPct;
    const countFactor = Math.min(1, sorted.length / 6);

    const confidence = Math.max(0, Math.min(1, 0.4 * countFactor + 0.4 * cadenceConsistency + 0.2 * amountConsistency));

    if (confidence < 0.55) {
      continue;
    }

    const last = sorted[sorted.length - 1]!;
    const first = sorted[0]!;

    let suggestedCron = "0 9 1 * *";
    if (cadence === "weekly") {
      const dow = last.date.getUTCDay(); // 0-6
      suggestedCron = `0 9 * * ${dow}`;
    } else {
      const dom = Math.max(1, Math.min(28, last.date.getUTCDate()));
      suggestedCron = `0 9 ${dom} * *`;
    }

    const merchantId = last.merchantId ? last.merchantId.toString() : null;
    const candidateId = sha256Hex(key).slice(0, 12);

    const nameBase = merchantId ? "Recurring charge" : normalizeRecurringKey(last.description) || "Recurring charge";
    const suggestedRule = {
      name: cadence === "weekly" ? `${nameBase} (weekly)` : `${nameBase} (monthly)`,
      cron: suggestedCron,
      status: "active" as const,
      ...(merchantId ? { merchant_id: merchantId } : {}),
      merchant_name: merchantId ? undefined : last.description.slice(0, 160),
      category: last.category || undefined,
      amount_min: Math.round(Math.max(0, amountMin) * 100) / 100,
      amount_max: Math.round(Math.max(0, amountMax) * 100) / 100,
    };

    const rationale = [
      `${sorted.length} occurrences in last ${daysBack} days`,
      `Median interval ${intervalMedian.toFixed(1)} days (${Math.round(intervalMatchPct * 100)}% consistent)`,
      `Amount range ${(amountRangePct * 100).toFixed(0)}% of average`,
    ];

    candidatesRaw.push({
      candidate_id: candidateId,
      cadence,
      confidence: Math.round(confidence * 1000) / 1000,
      occurrences: sorted.length,
      first_seen_at: first.date.toISOString(),
      last_seen_at: last.date.toISOString(),
      interval_days_median: Math.round(intervalMedian * 10) / 10,
      amount_avg: Math.round(amountAvg * 100) / 100,
      amount_min: Math.round(amountMin * 100) / 100,
      amount_max: Math.round(amountMax * 100) / 100,
      amount_range_pct: Math.round(amountRangePct * 1000) / 1000,
      category: last.category,
      merchant_id: merchantId,
      merchant_name: null,
      description_sample: last.description.slice(0, 250),
      suggested_cron: suggestedCron,
      suggested_rule: suggestedRule,
      rationale,
    });
  }

  candidatesRaw.sort((a, b) => b.confidence - a.confidence);
  const top = candidatesRaw.slice(0, limit);

  const merchantIds = top
    .map((c) => c.merchant_id)
    .filter((id): id is string => Boolean(id && mongoose.Types.ObjectId.isValid(id)));

  const merchants = merchantIds.length
    ? await MerchantModel.find({ orgId: params.orgId, _id: { $in: merchantIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select({ _id: 1, name: 1 })
        .lean()
    : [];

  const merchantNameById = new Map(merchants.map((m: any) => [String(m._id), String(m.name || "")]));

  for (const candidate of top) {
    if (candidate.merchant_id) {
      candidate.merchant_name = merchantNameById.get(candidate.merchant_id) || null;
      if (candidate.merchant_name) {
        candidate.suggested_rule.merchant_name = candidate.merchant_name;
      }
    }
  }

  const existingKeys = top
    .map((c) => ({
      orgId: params.orgId,
      status: "active",
      merchantId: c.merchant_id ? new mongoose.Types.ObjectId(c.merchant_id) : undefined,
      merchantName: c.merchant_id ? undefined : c.suggested_rule.merchant_name,
      category: c.category,
    }))
    .filter((row) => row.merchantId || row.merchantName);

  if (existingKeys.length > 0) {
    const existingRules = await RecurringRuleModel.find({
      orgId: params.orgId,
      status: "active",
    })
      .select({ merchantId: 1, merchantName: 1, category: 1, cron: 1 })
      .lean();

    const normalizedExisting = new Set(
      existingRules.map((rule: any) => {
        const merchantKey = rule.merchantId ? `m:${String(rule.merchantId)}` : `n:${normalizeRecurringKey(String(rule.merchantName || ""))}`;
        return `${merchantKey}|${String(rule.category || "")}`.toLowerCase();
      })
    );

    for (const candidate of top) {
      const merchantKey = candidate.merchant_id ? `m:${candidate.merchant_id}` : `n:${normalizeRecurringKey(candidate.suggested_rule.merchant_name || "")}`;
      const normalizedKey = `${merchantKey}|${String(candidate.category || "")}`.toLowerCase();
      if (normalizedExisting.has(normalizedKey)) {
        candidate.rationale.push("Existing recurring rule detected; candidate may be redundant.");
        candidate.confidence = Math.round(Math.max(0, candidate.confidence - 0.12) * 1000) / 1000;
      }
    }

    top.sort((a, b) => b.confidence - a.confidence);
  }

  return {
    org_id: params.orgId.toString(),
    days_back: daysBack,
    candidates: top,
  };
};

export type ForecastCategoryRow = {
  category: string;
  expense_monthly_avg: number;
};

export type ForecastResult = {
  org_id: string;
  currency: string;
  period_key: string;
  months: number;
  baseline: {
    days_covered: number;
    income_monthly_avg: number;
    expense_monthly_avg: number;
    net_monthly_avg: number;
  };
  recurring_rules: {
    active_rules: number;
    expense_expected_monthly: number;
    by_category: Array<{ category: string; expense_expected_monthly: number }>;
  };
  top_categories: ForecastCategoryRow[];
  projection: Array<{
    period_key: string;
    income: number;
    expense: number;
    net: number;
  }>;
};

const periodKeyFromDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const addMonthsUtc = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));

export const buildForecast = async (params: {
  orgId: mongoose.Types.ObjectId;
  periodKey?: string;
  months?: number;
  topCategories?: number;
}) : Promise<ForecastResult> => {
  const now = new Date();
  const periodKey = params.periodKey?.trim() || periodKeyFromDate(now);
  parsePeriodKey(periodKey);

  const months = clampInt(params.months, 3, 1, 24);
  const topCategories = clampInt(params.topCategories, 8, 0, 50);

  const org = await OrganizationModel.findById(params.orgId).select({ currency: 1 }).lean();
  const currency = String((org as any)?.currency || "USD");

  const daysCovered = 90;
  const cutoff = new Date(Date.now() - daysCovered * 24 * 60 * 60 * 1000);

  const totalsRows = await TransactionModel.aggregate([
    { $match: { orgId: params.orgId, date: { $gte: cutoff } } },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
        expense: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] } },
        net: { $sum: "$amount" },
      },
    },
  ]);

  const totals = (totalsRows?.[0] || {}) as any;

  const scale = 30 / daysCovered;
  const incomeMonthlyAvg = Number(totals.income || 0) * scale;
  const expenseMonthlyAvg = Number(totals.expense || 0) * scale;
  const netMonthlyAvg = Number(totals.net || 0) * scale;

  const categoryRows = topCategories
    ? await TransactionModel.aggregate([
        { $match: { orgId: params.orgId, date: { $gte: cutoff }, amount: { $lt: 0 } } },
        {
          $group: {
            _id: "$category",
            expense: { $sum: { $abs: "$amount" } },
          },
        },
        { $sort: { expense: -1 } },
        { $limit: topCategories },
      ])
    : [];

  const topCats: ForecastCategoryRow[] = categoryRows.map((row: any) => ({
    category: String(row?._id || "Other"),
    expense_monthly_avg: Math.round(Number(row?.expense || 0) * scale * 100) / 100,
  }));

  const recurringRules = await RecurringRuleModel.find({ orgId: params.orgId, status: "active" })
    .select({ category: 1, amountMin: 1, amountMax: 1 })
    .lean();

  const expectedByCategory = new Map<string, number>();
  let recurringTotal = 0;

  for (const rule of recurringRules as any[]) {
    const category = String(rule.category || "Other");
    const min = rule.amountMin !== undefined && rule.amountMin !== null ? Number(rule.amountMin) : null;
    const max = rule.amountMax !== undefined && rule.amountMax !== null ? Number(rule.amountMax) : null;
    const expected = min !== null && max !== null ? (min + max) / 2 : min !== null ? min : max !== null ? max : 0;
    if (!Number.isFinite(expected) || expected <= 0) continue;

    recurringTotal += expected;
    expectedByCategory.set(category, (expectedByCategory.get(category) || 0) + expected);
  }

  const recurringByCategory = Array.from(expectedByCategory.entries())
    .map(([category, amount]) => ({
      category,
      expense_expected_monthly: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.expense_expected_monthly - a.expense_expected_monthly)
    .slice(0, 20);

  const baseDate = parsePeriodKey(periodKey).start;
  const projection = Array.from({ length: months }).map((_, idx) => {
    const monthDate = addMonthsUtc(baseDate, idx);
    return {
      period_key: periodKeyFromDate(monthDate),
      income: Math.round(incomeMonthlyAvg * 100) / 100,
      expense: Math.round(expenseMonthlyAvg * 100) / 100,
      net: Math.round(netMonthlyAvg * 100) / 100,
    };
  });

  return {
    org_id: params.orgId.toString(),
    currency,
    period_key: periodKey,
    months,
    baseline: {
      days_covered: daysCovered,
      income_monthly_avg: Math.round(incomeMonthlyAvg * 100) / 100,
      expense_monthly_avg: Math.round(expenseMonthlyAvg * 100) / 100,
      net_monthly_avg: Math.round(netMonthlyAvg * 100) / 100,
    },
    recurring_rules: {
      active_rules: recurringRules.length,
      expense_expected_monthly: Math.round(recurringTotal * 100) / 100,
      by_category: recurringByCategory,
    },
    top_categories: topCats,
    projection,
  };
};

