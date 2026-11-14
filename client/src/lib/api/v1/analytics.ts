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
// Represents daily aggregated expenditure totals for calendar heatmap visualisations.
// Encapsulates the specific calendar date, total currency spent, and transaction count.
// Powers GitHub-style calendar frequency graphs highlighting daily spending volume.
export interface SpendingHeatmapItem {
  date: string;
  total: number;
  count: number;
}

// Encapsulates the response payload containing multi-day spending heatmap data points.
// Delivers organization identifiers, day count windows, currency rates, and data arrays.
// Supplies the data feed powering visual daily expenditure frequency charts.
export interface SpendingHeatmapResponse {
  org_id: string;
  days_back: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  data: SpendingHeatmapItem[];
  request_id: string;
}

/** One month's spending breakdown by category. */
// Captures single-month aggregate spending breakdowns distributed across categories.
// Encapsulates the calendar month key, category-to-amount mappings, and monthly sum.
// Powers stacked area and bar charts tracking evolving spending behavior over time.
export interface CategoryTrendMonth {
  month: string;
  categories: Record<string, number>;
  total: number;
}

// Encapsulates multi-month category spending trend series and exchange conversions.
// Delivers time-series category distributions across requested historical windows.
// Provides historical category velocity insights to monthly budgeting dashboards.
export interface CategoryTrendsResponse {
  org_id: string;
  months: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  data: CategoryTrendMonth[];
  request_id: string;
}

/** One month's income/expense summary with net and savings rate. */
// Encapsulates a monthly financial cash flow summary comparing inflows with outflows.
// Tracks total earned income, total expenditure, net surplus, and savings percentage.
// Drives comparative income versus expenditure trend charts and resilience metrics.
export interface IncomeExpenseMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
  savings_rate: number;
}

// Encapsulates the time-series response comparing income and expenses over months.
// Delivers organization identifiers, historical month spans, and cash flow data points.
// Powers high-level cash flow trajectories and savings rate progression charts.
export interface IncomeExpenseResponse {
  org_id: string;
  months: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  data: IncomeExpenseMonth[];
  request_id: string;
}

/** Balance and metadata for a single financial account. */
// Encapsulates current balance, institution details, and metadata for a bank account.
// Captures normalized balances, native currencies, and recent transaction timestamps.
// Feeds accounts overview tables and individual account balance tracking cards.
export interface AccountBalance {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  currency: string;
  original_currency?: string;
  balance: number;
  raw_balance?: number;
  transaction_count: number;
  last_transaction: string | null;
}

// Encapsulates account balance listings alongside consolidated net worth aggregates.
// Totals liquid assets, liabilities, and calculated net worth across institutions.
// Powers the primary asset allocation and net worth summary display on dashboards.
export interface AccountBalancesResponse {
  org_id: string;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  accounts: AccountBalance[];
  summary: {
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  };
  request_id: string;
}

/** A merchant ranked by total spend in the analysis period. */
// Represents a commercial vendor entity ranked by aggregate customer expenditure.
// Encapsulates vendor identifiers, total spent sums, visit counts, and average ticket.
// Feeds merchant ranking tables identifying top spending outflow destinations.
export interface TopMerchant {
  merchant_id: string;
  name: string;
  total: number;
  count: number;
  avg: number;
}

// Encapsulates the ranked list of highest-spend commercial merchants over a period.
// Delivers organization identifiers, month evaluation windows, and merchant arrays.
// Powers top vendor ranking widgets and merchant concentration analysis reports.
export interface TopMerchantsResponse {
  org_id: string;
  months: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  merchants: TopMerchant[];
  request_id: string;
}

// Represents converted valuation metrics for an individual international currency.
// Encapsulates currency symbols, active exchange rates, and localized net worth sums.
// Enables global asset comparison and multi-currency portfolio valuation displays.
export interface MultiCurrencyRateItem {
  currency: string;
  symbol: string;
  fx_rate: number;
  net_worth_localized: number;
  assets_localized: number;
  liabilities_localized: number;
}

// Encapsulates multi-currency net worth valuations converted against foreign exchange rates.
// Contrasts baseline currency totals against target currencies and multi-rate tables.
// Powers multi-currency toggle switchers and international net worth reporting views.
export interface MultiCurrencySummaryResponse {
  org_id: string;
  base_currency: string;
  target_currency: string;
  fx_rate: number;
  currency_symbol: string;
  base_summary: {
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  };
  converted_summary: {
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  };
  rates_table: MultiCurrencyRateItem[];
  request_id: string;
}

// ─── API Functions ────────────────────────────────────────

// Fetches daily spending aggregates over a specified historical lookback window.
// Formulates URL query parameters for lookback days and localized currency codes.
// Dispatches an authenticated GET request loading calendar spending heatmap items.
/** Fetch daily spending totals for heatmap visualisation. */
export async function getSpendingHeatmap(daysBack?: number, currency?: string): Promise<SpendingHeatmapResponse> {
  const search = new URLSearchParams();
  if (typeof daysBack === "number") search.set("days_back", String(daysBack));
  if (currency) search.set("currency", currency);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/analytics/spending-heatmap${query}`);
}

// Retrieves monthly category spending distributions across a historical month horizon.
// Formulates query parameters for month count and optional target currency codes.
// Dispatches an authenticated GET request loading category trend time-series data.
/** Fetch monthly spending breakdown by category. */
export async function getCategoryTrends(months?: number, currency?: string): Promise<CategoryTrendsResponse> {
  const search = new URLSearchParams();
  if (typeof months === "number") search.set("months", String(months));
  if (currency) search.set("currency", currency);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/analytics/category-trends${query}`);
}

// Retrieves monthly cash flow comparisons between earned income and spent funds.
// Formulates query parameters for historical month depth and currency conversions.
// Dispatches an authenticated GET request loading income versus expense metrics.
/** Fetch monthly income vs. expense summary with savings rate. */
export async function getIncomeExpenseSummary(months?: number, currency?: string): Promise<IncomeExpenseResponse> {
  const search = new URLSearchParams();
  if (typeof months === "number") search.set("months", String(months));
  if (currency) search.set("currency", currency);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/analytics/income-expense${query}`);
}

// Fetches current account balances and consolidated net worth across institutions.
// Encodes optional target currency codes to retrieve foreign exchange conversions.
// Dispatches an authenticated GET request returning the full accounts balance snapshot.
/** Fetch current balances across all accounts with net-worth summary. */
export async function getAccountBalances(currency?: string): Promise<AccountBalancesResponse> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return apiClient(`/analytics/account-balances${query}`);
}

// Retrieves highest-spend merchants ranked by total spend over historical intervals.
// Formulates query parameters for ranking limits, evaluation months, and currency.
// Dispatches an authenticated GET request returning top merchant distribution data.
/** Fetch highest-spend merchants, ranked by total spend. */
export async function getTopMerchants(params?: { limit?: number; months?: number; currency?: string }): Promise<TopMerchantsResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.months) search.set("months", String(params.months));
  if (params?.currency) search.set("currency", params.currency);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/analytics/top-merchants${suffix}`);
}

// Fetches converted asset, liability, and net worth summaries across target currencies.
// Formulates query parameters for target conversion currencies and exchange tables.
// Dispatches an authenticated GET request loading multi-currency net worth metrics.
/** Fetch multi-currency converted net worth summary and rates table. */
export async function getMultiCurrencySummary(currency?: string): Promise<MultiCurrencySummaryResponse> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return apiClient(`/analytics/multi-currency-summary${query}`);
}
