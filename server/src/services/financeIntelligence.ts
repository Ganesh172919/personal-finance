/**
 * @fileoverview Financial Intelligence & Analytics Service
 *
 * Implements core financial computations, budget envelope reconciliation,
 * recurring subscription detection, and cash flow trend analysis.
 *
 * ============================================================================
 * MINDMAP FLOW: FINANCIAL INTELLIGENCE & ENVELOPE RECONCILIATION
 * ============================================================================
 * - Financial Intelligence Engine
 *     ├── 1. Period Key Parsing & Temporal Ranges
 *     │   ├── parsePeriodKey: Validates YYYY-MM format
 *     │   └── UTC Date Boundaries: [start of month, end of month)
 *     ├── 2. Budget Envelope Reconciliation (getBudgetEnvelopes)
 *     │   ├── Redis Caching: env:<orgId>:<periodKey>
 *     │   ├── Planned Allocations: BudgetAllocationModel lookup
 *     │   ├── Actual Spend Aggregation: TransactionModel $group by category
 *     │   ├── Variance Derivation: remaining = planned - spent
 *     │   └── Unbudgeted Category Detection: Spends without envelope limits
 *     ├── 3. Recurring Subscription Detection (detectRecurringCandidates)
 *     │   ├── Merchant Transaction Clustering: Group by description & amount
 *     │   ├── Cadence Frequency Derivation: Weekly, bi-weekly, monthly, quarterly
 *     │   └── Confidence Scoring: Regularity of time delta + amount stability
 *     └── 4. Cash Flow & Net Worth Computation
 *         ├── Inflows vs Outflows aggregation
 *         ├── Net Savings Rate calculation
 *         └── Multi-Account Balance rollups (liquid, savings, debts)
 *
 * ============================================================================
 * ASCII FLOW: BUDGET ENVELOPE CALCULATION & CACHING PIPELINE
 * ============================================================================
 *               [ Request Budget Envelopes (orgId, periodKey) ]
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Check Redis Cache: env:<org>:<period>|
 *                  +------------------+-------------------+
 *                                /          \
 *                         Hit   /            \ Miss
 *                              v              v
 *                  [ Return Cached Result ] +--------------------------+
 *                                           | parsePeriodKey(period)   |
 *                                           | [start, end) Date Range  |
 *                                           +-------------+------------+
 *                                                         |
 *                                                         v
 *                                           +--------------------------+
 *                                           | Query BudgetAllocations  |
 *                                           | Planned amounts by cat   |
 *                                           +-------------+------------+
 *                                                         |
 *                                                         v
 *                                           +--------------------------+
 *                                           | Aggregate Transactions:  |
 *                                           | $match date, amount < 0  |
 *                                           | $group by category       |
 *                                           +-------------+------------+
 *                                                         |
 *                                                         v
 *                                           +--------------------------+
 *                                           | Reconcile Planned vs     |
 *                                           | Spent per Category:      |
 *                                           | remaining = planned-spent|
 *                                           | Flag unbudgeted spending |
 *                                           +-------------+------------+
 *                                                         |
 *                                                         v
 *                                           +--------------------------+
 *                                           | Cache in Redis (env:...) |
 *                                           | Return BudgetEnvelopes   |
 *                                           +--------------------------+
 *
 * @module services/financeIntelligence
 */

import crypto from "crypto";
import mongoose from "mongoose";

import AccountModel from "../models/accountModel";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import MerchantModel from "../models/merchantModel";
import OrganizationModel from "../models/organizationModel";
import RecurringRuleModel from "../models/recurringRuleModel";
import TransactionModel from "../models/transactionModel";
import { cacheDel, cacheGet, cacheSet } from "../config/redis";
import {
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  SUPPORTED_CURRENCIES,
  convertUsdToCurrency,
  normalizeCurrency,
} from "../utils/currencyFx";

// Parses and constrains a numeric parameter within defined upper and lower integer bounds.
// Defaults safely to the fallback value when encountering invalid or non-numeric arguments.
// Prevents out-of-range integer parameters from corrupting downstream financial queries.
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

// Validates and parses a YYYY-MM period key into UTC year, month, start, and end dates.
// Ensures months fall strictly between 1 and 12, throwing descriptive errors on failure.
// Computes start-of-month and start-of-next-month timestamps for range-based database queries.
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

// Represents a single category row within a budget envelope reconciliation report.
// Tracks planned allocations, actual expenditures, remaining surplus/deficit, and transaction counts.
// Flags unbudgeted categories where expenses occurred without predefined allocations.
export type BudgetEnvelopeRow = {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  currency: string;
  tx_count: number;
  unbudgeted: boolean;
};

// Encapsulates organization-wide budget envelope reconciliation data for a billing period.
// Supplies converted monetary totals, FX conversion rates, and per-category envelope lists.
// Powers dashboard budget tracking widgets and financial coach alert engines.
export type BudgetEnvelopesResult = {
  org_id: string;
  period_key: string;
  currency: string;
  fx_rate?: number;
  currency_symbol?: string;
  totals: {
    planned: number;
    spent: number;
    remaining: number;
    unbudgeted_spent: number;
  };
  envelopes: BudgetEnvelopeRow[];
};

// Compares planned category budget allocations against actual transaction expenditures.
// Aggregates expenses by category and identifies unbudgeted or overspent allocations.
// Supports multi-currency FX conversions and caches reconciled envelope results in Redis.
export const getBudgetEnvelopes = async (params: {
  orgId: mongoose.Types.ObjectId;
  periodKey: string;
  currency?: string;
  fresh?: boolean;
}) : Promise<BudgetEnvelopesResult> => {
  const targetCurrency = params.currency ? normalizeCurrency(params.currency) : undefined;
  const isFxConversion = Boolean(targetCurrency);
  const fxRate = targetCurrency ? (FX_RATES_TO_USD[targetCurrency] ?? 1.0) : 1.0;
  const currencySymbol = targetCurrency ? (CURRENCY_SYMBOLS[targetCurrency] ?? "$") : undefined;

  const cacheKey = targetCurrency
    ? `env:${params.orgId.toString()}:${params.periodKey}:${targetCurrency}`
    : `env:${params.orgId.toString()}:${params.periodKey}`;

  const cached = params.fresh ? null : await cacheGet<BudgetEnvelopesResult>(cacheKey);
  if (cached) return cached;

  const { start, end } = parsePeriodKey(params.periodKey);

  const org = await OrganizationModel.findById(params.orgId).select({ currency: 1 }).lean();
  const baseCurrency = String((org as any)?.currency || "USD");
  const currency = isFxConversion ? targetCurrency! : baseCurrency;

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
      currency: String(allocation.currency || baseCurrency),
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
      currency: baseCurrency,
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

  const convertedEnvelopes = envelopes.map((row) => {
    const planned = isFxConversion ? convertUsdToCurrency(row.planned, targetCurrency!) : Math.round(row.planned * 100) / 100;
    const spent = isFxConversion ? convertUsdToCurrency(row.spent, targetCurrency!) : Math.round(row.spent * 100) / 100;
    const remaining = isFxConversion
      ? (targetCurrency === "JPY" ? Math.round(planned - spent) : Math.round((planned - spent) * 100) / 100)
      : Math.round(row.remaining * 100) / 100;
    return {
      ...row,
      planned,
      spent,
      remaining,
      currency: isFxConversion ? targetCurrency! : row.currency,
    };
  });

  const convertedTotals = {
    planned: isFxConversion ? convertUsdToCurrency(totals.planned, targetCurrency!) : Math.round(totals.planned * 100) / 100,
    spent: isFxConversion ? convertUsdToCurrency(totals.spent, targetCurrency!) : Math.round(totals.spent * 100) / 100,
    remaining: isFxConversion
      ? (targetCurrency === "JPY"
          ? Math.round(convertUsdToCurrency(totals.planned, targetCurrency!) - convertUsdToCurrency(totals.spent, targetCurrency!))
          : Math.round((convertUsdToCurrency(totals.planned, targetCurrency!) - convertUsdToCurrency(totals.spent, targetCurrency!)) * 100) / 100)
      : Math.round(totals.remaining * 100) / 100,
    unbudgeted_spent: isFxConversion ? convertUsdToCurrency(totals.unbudgeted_spent, targetCurrency!) : Math.round(totals.unbudgeted_spent * 100) / 100,
  };

  const result: BudgetEnvelopesResult = {
    org_id: params.orgId.toString(),
    period_key: params.periodKey,
    currency,
    ...(isFxConversion ? { fx_rate: fxRate, currency_symbol: currencySymbol } : {}),
    totals: convertedTotals,
    envelopes: convertedEnvelopes,
  };

  if (!params.fresh) await cacheSet(cacheKey, result, 300);
  return result;
};

export async function invalidateBudgetEnvelopes(orgId: string, date: Date): Promise<void> {
  const prefix = `env:${orgId}:${date.toISOString().slice(0, 7)}`;
  await Promise.all([cacheDel(prefix), ...SUPPORTED_CURRENCIES.map(currency => cacheDel(`${prefix}:${currency}`))]);
}

// Cleanses transaction descriptions to generate canonical keys for recurring clustering.
// Removes numeric identifiers, collapses extra whitespace, and strips special characters.
// Groups recurring subscriptions accurately despite minor variation in descriptor strings.
const normalizeRecurringKey = (value: string) => {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower) return "";

  const squashed = lower.replace(/\s+/g, " ");
  const noIds = squashed.replace(/\b\d{3,}\b/g, "");
  const stripped = noIds.replace(/[^a-z0-9 &./:-]+/g, "");
  return stripped.trim().slice(0, 160);
};

// Computes the statistical median value from an array of numeric intervals or amounts.
// Sorts values numerically and resolves the middle element or average of midpoints.
// Provides robust central tendency estimation resistant to outlier transaction timings.
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
};

// Converts an unknown numeric money value to a non-negative absolute number.
// Gracefully handles non-numeric or invalid inputs by returning zero.
// Guarantees clean currency amounts for transaction arithmetic and variance computations.
const safeAbsMoney = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
};

// Computes the absolute calendar day difference between two JavaScript Date timestamps.
// Normalizes millisecond epoch offsets into standard 24-hour day multiples.
// Used to analyze intervals between transaction occurrences during cadence detection.
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));

// Generates a hexadecimal SHA256 digest string from an arbitrary input value.
// Produces deterministic candidate identifiers based on normalized transaction signatures.
// Ensures consistent and unique identification keys across recurring detection sweeps.
const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Models a detected recurring transaction cluster representing an unmanaged subscription.
// Captures cadence frequencies (weekly or monthly), interval medians, and confidence scores.
// Formulates suggested cron schedules and automated recurring rule definitions.
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

// Analyzes historical transactions to uncover recurring subscription charges and bills.
// Clusters transactions by merchant and description, evaluating interval and amount consistency.
// Cross-references existing active rules and returns ranked recurring candidate suggestions.
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

// Represents a single category breakdown row in a forward-looking financial forecast.
// Captures category naming alongside normalized monthly average expense estimates.
// Enables comparative category-level expense visualization in predictive charts.
export type ForecastCategoryRow = {
  category: string;
  expense_monthly_avg: number;
};

// Encapsulates projected budget burn pressure for a specific spending category.
// Computes burn rate percentages and projected month-end budget variance overshoots.
// Classifies severity into watch, at-risk, or over-budget diagnostic tiers.
export type ForecastBudgetPressureRow = {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  projected_spend: number;
  projected_over_by: number;
  burn_rate_pct: number;
  severity: "watch" | "at_risk" | "over";
  unbudgeted: boolean;
};

// Defines a structured financial risk alert generated from forecast projections.
// Details severity, descriptive titles, monetary amounts, and recommended remedies.
// Alerts users to upcoming cashflow gaps, depleted runway, or runaway spending.
export type ForecastRiskAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  recommended_action: string;
  category?: string;
  amount?: number;
};

// Details an actionable financial recommendation to optimize forward cashflow.
// Prioritizes suggestions by urgency and estimates dollar impact on monthly savings.
// Provides concrete steps for users to close cashflow gaps and stabilize budgets.
export type ForecastActionItem = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  impact_estimate: number | null;
};

// Models a complete multi-month financial forecast and cashflow projection result.
// Combines historical baselines, recurring obligations, budget pressure, and risk alerts.
// Computes overall financial health scores, projected cash balances, and runway months.
export type ForecastResult = {
  org_id: string;
  currency: string;
  fx_rate?: number;
  currency_symbol?: string;
  period_key: string;
  months: number;
  baseline: {
    days_covered: number;
    transaction_count: number;
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
    cumulative_net: number;
    projected_cash_balance: number | null;
  }>;
  budget_pressure: {
    period_key: string;
    days_elapsed_ratio: number;
    projected_total_spend: number;
    projected_total_over_by: number;
    over_budget_count: number;
    at_risk_count: number;
    unbudgeted_spent: number;
    categories: ForecastBudgetPressureRow[];
  };
  cashflow_health: {
    score: number;
    status: "healthy" | "watch" | "at_risk";
    savings_rate_pct: number;
    liquidity_balance: number | null;
    liquidity_accounts: number;
    runway_months: number | null;
    projected_end_balance: number | null;
    confidence: "low" | "medium" | "high";
    data_quality: string[];
  };
  risk_alerts: ForecastRiskAlert[];
  recommended_actions: ForecastActionItem[];
};

// Formats a Date object into a canonical YYYY-MM period identifier string.
// Zero-pads calendar months to guarantee lexicographically sorted consistency.
// Used throughout forecast projection loops to index sequential monthly periods.
const periodKeyFromDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

// Computes a future or past date offset by an exact number of calendar months in UTC.
// Pins day to the first of the month to avoid irregular month-end clipping discrepancies.
// Generates sequential monthly intervals for forward-looking forecast timeline models.
const addMonthsUtc = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));

// Rounds a floating point currency figure to exactly two decimal cent places.
// Eliminates IEEE floating point inaccuracies in displayed financial totals.
// Standardizes currency precision across projection outputs and budget reports.
const roundMoney = (value: number) => Math.round(value * 100) / 100;

// Rounds a floating point ratio or factor to three decimal places of precision.
// Maintains numerical accuracy for elapsed month ratios and statistical coefficients.
// Prevents lengthy decimal representations in serialized forecast responses.
const roundRatio = (value: number) => Math.round(value * 1000) / 1000;

// Constrains a computed financial health score between zero and one hundred.
// Rounds fractional score contributions to whole integer values.
// Ensures composite scores remain within valid standardized percentage bounds.
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const severityRank: Record<ForecastBudgetPressureRow["severity"], number> = {
  over: 3,
  at_risk: 2,
  watch: 1,
};

// Evaluates budget envelope spend progression relative to elapsed calendar time.
// Extrapolates projected month-end category spending based on current daily burn rates.
// Flags categories tracking ahead of budget allocations and tallies total overshoots.
const buildBudgetPressure = (envelopesResult: BudgetEnvelopesResult, periodKey: string, now: Date) => {
  const { start, end } = parsePeriodKey(periodKey);
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const elapsedMs = Math.min(Math.max(0, now.getTime() - start.getTime()), totalMs);
  const elapsedRatio = elapsedMs / totalMs;
  const projectionRatio = elapsedRatio > 0 && elapsedRatio < 1 ? Math.max(0.08, elapsedRatio) : 1;

  let projectedTotalSpend = 0;
  let projectedTotalOverBy = 0;
  let overBudgetCount = 0;
  let atRiskCount = 0;

  const categories: ForecastBudgetPressureRow[] = [];

  for (const row of envelopesResult.envelopes) {
    const planned = Math.max(0, Number(row.planned || 0));
    const spent = Math.max(0, Number(row.spent || 0));
    const projectedSpend = elapsedRatio > 0 && elapsedRatio < 1 ? spent / projectionRatio : spent;
    const projectedOverBy = row.unbudgeted ? projectedSpend : Math.max(0, projectedSpend - planned);
    const burnRatePct = planned > 0 ? (projectedSpend / planned) * 100 : row.unbudgeted && spent > 0 ? 100 : 0;

    projectedTotalSpend += projectedSpend;
    projectedTotalOverBy += projectedOverBy;

    let severity: ForecastBudgetPressureRow["severity"] | null = null;
    if (row.unbudgeted && spent > 0) {
      severity = "over";
      overBudgetCount += 1;
    } else if (planned > 0 && row.remaining < 0) {
      severity = "over";
      overBudgetCount += 1;
    } else if (planned > 0 && projectedOverBy > 0) {
      severity = "at_risk";
      atRiskCount += 1;
    } else if (planned > 0 && burnRatePct >= 85) {
      severity = "watch";
    }

    if (!severity) continue;

    categories.push({
      category: row.category,
      planned: roundMoney(planned),
      spent: roundMoney(spent),
      remaining: roundMoney(Number(row.remaining || 0)),
      projected_spend: roundMoney(projectedSpend),
      projected_over_by: roundMoney(projectedOverBy),
      burn_rate_pct: Math.round(burnRatePct),
      severity,
      unbudgeted: row.unbudgeted,
    });
  }

  categories.sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.projected_over_by - a.projected_over_by;
  });

  return {
    period_key: periodKey,
    days_elapsed_ratio: roundRatio(elapsedRatio),
    projected_total_spend: roundMoney(projectedTotalSpend),
    projected_total_over_by: roundMoney(projectedTotalOverBy),
    over_budget_count: overBudgetCount,
    at_risk_count: atRiskCount,
    unbudgeted_spent: roundMoney(envelopesResult.totals.unbudgeted_spent),
    categories: categories.slice(0, 12),
  };
};

// Assembles multi-month predictive cashflow projections based on historical transactions.
// Combines baseline averages, recurring rules, budget pressure, and liquid cash balances.
// Delivers projected cash balances, health scores, risk alerts, and optimization actions.
export const buildForecast = async (params: {
  orgId: mongoose.Types.ObjectId;
  periodKey?: string;
  months?: number;
  topCategories?: number;
  currency?: string;
}) : Promise<ForecastResult> => {
  const targetCurrency = params.currency ? normalizeCurrency(params.currency) : undefined;
  const isFxConversion = Boolean(targetCurrency);
  const fxRate = targetCurrency ? (FX_RATES_TO_USD[targetCurrency] ?? 1.0) : 1.0;
  const currencySymbol = targetCurrency ? (CURRENCY_SYMBOLS[targetCurrency] ?? "$") : undefined;

  const now = new Date();
  const periodKey = params.periodKey?.trim() || periodKeyFromDate(now);
  parsePeriodKey(periodKey);

  const months = clampInt(params.months, 3, 1, 24);
  const topCategories = clampInt(params.topCategories, 8, 0, 50);

  const org = await OrganizationModel.findById(params.orgId).select({ currency: 1 }).lean();
  const baseCurrency = String((org as any)?.currency || "USD");
  const currency = isFxConversion ? targetCurrency! : baseCurrency;

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
        transaction_count: { $sum: 1 },
      },
    },
  ]);

  const totals = (totalsRows?.[0] || {}) as any;

  const scale = 30 / daysCovered;
  const rawIncomeAvg = Number(totals.income || 0) * scale;
  const rawExpenseAvg = Number(totals.expense || 0) * scale;
  const rawNetAvg = Number(totals.net || 0) * scale;
  const transactionCount = Number(totals.transaction_count || 0);

  const incomeMonthlyAvg = isFxConversion ? convertUsdToCurrency(rawIncomeAvg, targetCurrency!) : rawIncomeAvg;
  const expenseMonthlyAvg = isFxConversion ? convertUsdToCurrency(rawExpenseAvg, targetCurrency!) : rawExpenseAvg;
  const netMonthlyAvg = isFxConversion
    ? (targetCurrency === "JPY" ? Math.round(incomeMonthlyAvg - expenseMonthlyAvg) : Math.round((incomeMonthlyAvg - expenseMonthlyAvg) * 100) / 100)
    : rawNetAvg;

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

  const topCats: ForecastCategoryRow[] = categoryRows.map((row: any) => {
    const rawVal = Number(row?.expense || 0) * scale;
    return {
      category: String(row?._id || "Other"),
      expense_monthly_avg: isFxConversion
        ? convertUsdToCurrency(rawVal, targetCurrency!)
        : Math.round(rawVal * 100) / 100,
    };
  });

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
      expense_expected_monthly: isFxConversion
        ? convertUsdToCurrency(amount, targetCurrency!)
        : Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.expense_expected_monthly - a.expense_expected_monthly)
    .slice(0, 20);

  const convertedRecurringTotal = isFxConversion
    ? convertUsdToCurrency(recurringTotal, targetCurrency!)
    : recurringTotal;

  const expenseMonthlyForecast = Math.max(expenseMonthlyAvg, convertedRecurringTotal);
  const netMonthlyForecast = incomeMonthlyAvg - expenseMonthlyForecast;

  const liquidityAccounts = await AccountModel.find({
    orgId: params.orgId,
    status: "active",
    type: { $in: ["checking", "savings", "cash"] },
  })
    .select({ _id: 1, openingBalance: 1 })
    .lean();

  const liquidityAccountIds = (liquidityAccounts as any[]).map((account) => new mongoose.Types.ObjectId(String(account._id)));
  const liquidityRows = liquidityAccountIds.length
    ? await TransactionModel.aggregate([
        {
          $match: {
            orgId: params.orgId,
            accountId: { $in: liquidityAccountIds },
          },
        },
        {
          $group: {
            _id: "$accountId",
            transaction_total: { $sum: "$amount" },
          },
        },
      ])
    : [];

  const transactionTotalByAccount = new Map(
    liquidityRows.map((row: any) => [String(row?._id), Number(row?.transaction_total || 0)])
  );

  const rawLiquidityBalance =
    liquidityAccounts.length > 0
      ? roundMoney(
          (liquidityAccounts as any[]).reduce((sum, account) => {
            const accountId = String(account._id);
            return sum + Number(account.openingBalance || 0) + Number(transactionTotalByAccount.get(accountId) || 0);
          }, 0)
        )
      : null;

  const liquidityBalance =
    rawLiquidityBalance === null
      ? null
      : isFxConversion
        ? convertUsdToCurrency(rawLiquidityBalance, targetCurrency!)
        : rawLiquidityBalance;

  const envelopesResult = await getBudgetEnvelopes({ orgId: params.orgId, periodKey, currency: params.currency });
  const budgetPressure = buildBudgetPressure(envelopesResult, periodKey, now);
  const hasBudgetAllocations = envelopesResult.envelopes.some((row) => Number(row.planned || 0) > 0);

  const savingsRatePct =
    incomeMonthlyAvg > 0
      ? (netMonthlyForecast / incomeMonthlyAvg) * 100
      : netMonthlyForecast < 0
        ? -100
        : 0;

  const runwayMonths =
    liquidityBalance !== null && netMonthlyForecast < 0
      ? Math.max(0, liquidityBalance) / Math.max(1, Math.abs(netMonthlyForecast))
      : null;

  const baseDate = parsePeriodKey(periodKey).start;
  let cumulativeNet = 0;
  const projection = Array.from({ length: months }).map((_, idx) => {
    const monthDate = addMonthsUtc(baseDate, idx);
    cumulativeNet += netMonthlyForecast;
    const roundedNet = targetCurrency === "JPY" ? Math.round(netMonthlyForecast) : Math.round(netMonthlyForecast * 100) / 100;
    const roundedCumulative = targetCurrency === "JPY" ? Math.round(cumulativeNet) : roundMoney(cumulativeNet);
    return {
      period_key: periodKeyFromDate(monthDate),
      income: targetCurrency === "JPY" ? Math.round(incomeMonthlyAvg) : Math.round(incomeMonthlyAvg * 100) / 100,
      expense: targetCurrency === "JPY" ? Math.round(expenseMonthlyForecast) : Math.round(expenseMonthlyForecast * 100) / 100,
      net: roundedNet,
      cumulative_net: roundedCumulative,
      projected_cash_balance:
        liquidityBalance === null
          ? null
          : targetCurrency === "JPY"
            ? Math.round(liquidityBalance + cumulativeNet)
            : roundMoney(liquidityBalance + cumulativeNet),
    };
  });

  const projectedEndBalance =
    liquidityBalance === null
      ? null
      : targetCurrency === "JPY"
        ? Math.round(liquidityBalance + projection.reduce((sum, row) => sum + row.net, 0))
        : roundMoney(liquidityBalance + projection.reduce((sum, row) => sum + row.net, 0));

  const dataQuality: string[] = [];
  if (transactionCount < 8) {
    dataQuality.push("Fewer than 8 transactions in the last 90 days.");
  }
  if (liquidityAccounts.length === 0) {
    dataQuality.push("No active checking, savings, or cash accounts; runway is unavailable.");
  }
  if (!hasBudgetAllocations) {
    dataQuality.push("No budget allocations found for the selected period.");
  }
  if (recurringRules.length === 0) {
    dataQuality.push("No active recurring rules; fixed obligations may be under-modeled.");
  }

  let confidenceScore = 0;
  if (transactionCount >= 30) confidenceScore += 2;
  else if (transactionCount >= 8) confidenceScore += 1;
  if (liquidityAccounts.length > 0) confidenceScore += 1;
  if (hasBudgetAllocations) confidenceScore += 1;
  if (recurringRules.length > 0) confidenceScore += 1;

  const confidence: "low" | "medium" | "high" =
    confidenceScore >= 4 ? "high" : confidenceScore >= 2 ? "medium" : "low";

  let healthScore = 55;
  if (incomeMonthlyAvg <= 0 && expenseMonthlyForecast > 0) {
    healthScore -= 20;
  } else if (savingsRatePct >= 20) {
    healthScore += 25;
  } else if (savingsRatePct >= 10) {
    healthScore += 15;
  } else if (savingsRatePct >= 0) {
    healthScore += 5;
  } else if (savingsRatePct > -10) {
    healthScore -= 10;
  } else {
    healthScore -= 20;
  }

  if (liquidityBalance === null) {
    healthScore -= 5;
  } else if (netMonthlyForecast < 0) {
    if (runwayMonths !== null && runwayMonths < 1) healthScore -= 35;
    else if (runwayMonths !== null && runwayMonths < 3) healthScore -= 25;
    else if (runwayMonths !== null && runwayMonths < 6) healthScore -= 10;
    else healthScore += 10;
  } else if (expenseMonthlyForecast > 0) {
    const reserveMonths = liquidityBalance / expenseMonthlyForecast;
    if (reserveMonths >= 3) healthScore += 10;
    else if (reserveMonths >= 1) healthScore += 5;
  } else {
    healthScore += 10;
  }

  healthScore -= Math.min(20, (budgetPressure.projected_total_over_by / Math.max(100, expenseMonthlyForecast)) * 25);
  healthScore -= Math.min(10, (budgetPressure.unbudgeted_spent / Math.max(100, expenseMonthlyForecast)) * 15);
  if (confidence === "low") healthScore -= 5;

  const score = clampScore(healthScore);
  const status: "healthy" | "watch" | "at_risk" = score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk";

  const riskAlerts: ForecastRiskAlert[] = [];
  if (netMonthlyForecast < 0) {
    riskAlerts.push({
      id: "negative-cashflow",
      severity: runwayMonths !== null && runwayMonths < 3 ? "critical" : "warning",
      title: "Projected monthly cashflow is negative",
      detail: `Forecasted expenses exceed income by ${roundMoney(Math.abs(netMonthlyForecast)).toFixed(2)} ${currency} per month.`,
      recommended_action: "Reduce flexible spending, increase income, or move a nonessential recurring charge out of the forecast.",
      amount: roundMoney(Math.abs(netMonthlyForecast)),
    });
  }

  if (runwayMonths !== null && runwayMonths < 6) {
    riskAlerts.push({
      id: "low-runway",
      severity: runwayMonths < 3 ? "critical" : "warning",
      title: "Cash runway is thin",
      detail: `Available cash covers about ${roundRatio(runwayMonths)} months at the current projected burn rate.`,
      recommended_action: "Prioritize an emergency buffer before adding new discretionary commitments.",
      amount: liquidityBalance ?? undefined,
    });
  }

  const topBudgetRisk = budgetPressure.categories[0];
  if (topBudgetRisk) {
    riskAlerts.push({
      id: `budget-${normalizeRecurringKey(topBudgetRisk.category) || "risk"}`,
      severity: topBudgetRisk.severity === "over" ? "warning" : "info",
      title: `${topBudgetRisk.category} needs attention`,
      detail: topBudgetRisk.unbudgeted
        ? `${topBudgetRisk.category} has ${topBudgetRisk.spent.toFixed(2)} ${currency} of unbudgeted spend.`
        : `${topBudgetRisk.category} is tracking toward ${topBudgetRisk.projected_spend.toFixed(2)} ${currency} against a ${topBudgetRisk.planned.toFixed(2)} ${currency} budget.`,
      recommended_action: topBudgetRisk.unbudgeted
        ? "Create an allocation or reclassify transactions so this spend is planned."
        : "Trim upcoming spend in this category or reallocate budget from a lower-priority envelope.",
      category: topBudgetRisk.category,
      amount: topBudgetRisk.projected_over_by,
    });
  }

  if (recurringTotal > 0 && incomeMonthlyAvg > 0 && recurringTotal / incomeMonthlyAvg > 0.45) {
    riskAlerts.push({
      id: "recurring-load",
      severity: "warning",
      title: "Recurring commitments are high",
      detail: `Active recurring rules consume about ${Math.round((recurringTotal / incomeMonthlyAvg) * 100)}% of monthly income.`,
      recommended_action: "Review subscriptions, fixed bills, and debt payments for cancellations or renegotiation opportunities.",
      amount: roundMoney(recurringTotal),
    });
  }

  if (confidence === "low") {
    riskAlerts.push({
      id: "low-confidence",
      severity: "info",
      title: "Forecast confidence is low",
      detail: dataQuality[0] || "More account, budget, transaction, and recurring-rule data will improve this forecast.",
      recommended_action: "Import recent transactions and add active cash accounts before making major decisions from this projection.",
    });
  }

  if (riskAlerts.length === 0) {
    riskAlerts.push({
      id: "stable-cashflow",
      severity: "info",
      title: "Cashflow looks stable",
      detail: "The current forecast does not show urgent cashflow, runway, or budget pressure issues.",
      recommended_action: "Use the projected surplus to fund goals, pay down debt, or increase emergency reserves.",
      amount: roundMoney(Math.max(0, netMonthlyForecast)),
    });
  }

  const recommendedActions: ForecastActionItem[] = [];
  if (netMonthlyForecast < 0) {
    recommendedActions.push({
      id: "close-monthly-gap",
      priority: "high",
      title: "Close the monthly cashflow gap",
      detail: `Find ${roundMoney(Math.abs(netMonthlyForecast)).toFixed(2)} ${currency} per month through cuts, income, or timing changes.`,
      impact_estimate: roundMoney(Math.abs(netMonthlyForecast)),
    });
  }
  if (topBudgetRisk) {
    recommendedActions.push({
      id: "stabilize-top-budget-risk",
      priority: topBudgetRisk.severity === "over" ? "high" : "medium",
      title: `Stabilize ${topBudgetRisk.category}`,
      detail: topBudgetRisk.unbudgeted
        ? "Add a budget allocation so this spending is visible before it becomes a surprise."
        : `Bring projected spend down by ${topBudgetRisk.projected_over_by.toFixed(2)} ${currency} or formally reallocate budget.`,
      impact_estimate: topBudgetRisk.projected_over_by,
    });
  }
  if (recurringRules.length === 0) {
    recommendedActions.push({
      id: "add-recurring-rules",
      priority: "medium",
      title: "Model fixed obligations",
      detail: "Add recurring rules for rent, subscriptions, debt payments, and insurance to make forecasts less noisy.",
      impact_estimate: null,
    });
  }
  if (netMonthlyForecast > 0 && savingsRatePct >= 10) {
    recommendedActions.push({
      id: "route-surplus",
      priority: "low",
      title: "Route the projected surplus",
      detail: `Assign the ${roundMoney(netMonthlyForecast).toFixed(2)} ${currency} monthly surplus to emergency savings, goals, or debt payoff.`,
      impact_estimate: roundMoney(netMonthlyForecast),
    });
  }

  return {
    org_id: params.orgId.toString(),
    currency,
    ...(isFxConversion ? { fx_rate: fxRate, currency_symbol: currencySymbol } : {}),
    period_key: periodKey,
    months,
    baseline: {
      days_covered: daysCovered,
      transaction_count: transactionCount,
      income_monthly_avg: targetCurrency === "JPY" ? Math.round(incomeMonthlyAvg) : Math.round(incomeMonthlyAvg * 100) / 100,
      expense_monthly_avg: targetCurrency === "JPY" ? Math.round(expenseMonthlyAvg) : Math.round(expenseMonthlyAvg * 100) / 100,
      net_monthly_avg: targetCurrency === "JPY" ? Math.round(netMonthlyAvg) : Math.round(netMonthlyAvg * 100) / 100,
    },
    recurring_rules: {
      active_rules: recurringRules.length,
      expense_expected_monthly: targetCurrency === "JPY" ? Math.round(convertedRecurringTotal) : Math.round(convertedRecurringTotal * 100) / 100,
      by_category: recurringByCategory,
    },
    top_categories: topCats,
    projection,
    budget_pressure: budgetPressure,
    cashflow_health: {
      score,
      status,
      savings_rate_pct: Math.round(savingsRatePct * 10) / 10,
      liquidity_balance: liquidityBalance,
      liquidity_accounts: liquidityAccounts.length,
      runway_months: runwayMonths === null ? null : roundRatio(runwayMonths),
      projected_end_balance: projectedEndBalance,
      confidence,
      data_quality: dataQuality,
    },
    risk_alerts: riskAlerts.slice(0, 6),
    recommended_actions: recommendedActions.slice(0, 5),
  };
};
