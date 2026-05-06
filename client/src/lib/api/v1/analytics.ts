/**
 * @fileoverview V1 Analytics API
 *
 * Provides granular financial analytics endpoints that power dashboards
 * and data visualisations. Each endpoint returns pre-aggregated data
 * optimised for rendering charts and summaries.
 *
 * Endpoints:
 * - **Spending Heatmap**: Daily spending totals over N days, ideal for
 *   calendar-style heatmap visualisations.
 * - **Category Trends**: Monthly spending breakdown by category, useful
 *   for stacked area/bar charts showing how spending patterns shift.
 * - **Income vs. Expense**: Monthly income, expense, net, and savings
 *   rate for trend analysis.
 * - **Account Balances**: Current balances across all accounts with a
 *   net-worth summary (assets - liabilities).
 * - **Top Merchants**: Highest-spend merchants over a period, ranked
 *   by total spend.
 *
 * All endpoints are scoped to the active organisation via the `apiClient`.
 */

import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

/** A single day's aggregated spending for the heatmap. */
export interface SpendingHeatmapItem {
  date: string;
  total: number;
  count: number;
}

export interface SpendingHeatmapResponse {
  org_id: string;
  days_back: number;
  data: SpendingHeatmapItem[];
  request_id: string;
}

/** One month's spending breakdown by category. */
export interface CategoryTrendMonth {
  month: string;
  categories: Record<string, number>;
  total: number;
}

export interface CategoryTrendsResponse {
  org_id: string;
  months: number;
  data: CategoryTrendMonth[];
  request_id: string;
}

/** One month's income/expense summary with net and savings rate. */
export interface IncomeExpenseMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
  savings_rate: number;
}

export interface IncomeExpenseResponse {
  org_id: string;
  months: number;
  data: IncomeExpenseMonth[];
  request_id: string;
}

/** Balance and metadata for a single financial account. */
export interface AccountBalance {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  currency: string;
  balance: number;
  transaction_count: number;
  last_transaction: string | null;
}

export interface AccountBalancesResponse {
  org_id: string;
  accounts: AccountBalance[];
  summary: {
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  };
  request_id: string;
}

/** A merchant ranked by total spend in the analysis period. */
export interface TopMerchant {
  merchant_id: string;
  name: string;
  total: number;
  count: number;
  avg: number;
}

export interface TopMerchantsResponse {
  org_id: string;
  months: number;
  merchants: TopMerchant[];
  request_id: string;
}

// ─── API Functions ────────────────────────────────────────

/** Fetch daily spending totals for heatmap visualisation. */
export async function getSpendingHeatmap(daysBack?: number): Promise<SpendingHeatmapResponse> {
  const query = typeof daysBack === "number" ? `?days_back=${daysBack}` : "";
  return apiClient(`/v1/analytics/spending-heatmap${query}`);
}

/** Fetch monthly spending breakdown by category. */
export async function getCategoryTrends(months?: number): Promise<CategoryTrendsResponse> {
  const query = typeof months === "number" ? `?months=${months}` : "";
  return apiClient(`/v1/analytics/category-trends${query}`);
}

/** Fetch monthly income vs. expense summary with savings rate. */
export async function getIncomeExpenseSummary(months?: number): Promise<IncomeExpenseResponse> {
  const query = typeof months === "number" ? `?months=${months}` : "";
  return apiClient(`/v1/analytics/income-expense${query}`);
}

/** Fetch current balances across all accounts with net-worth summary. */
export async function getAccountBalances(): Promise<AccountBalancesResponse> {
  return apiClient("/v1/analytics/account-balances");
}

/** Fetch highest-spend merchants, ranked by total spend. */
export async function getTopMerchants(params?: { limit?: number; months?: number }): Promise<TopMerchantsResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.months) search.set("months", String(params.months));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/analytics/top-merchants${suffix}`);
}
