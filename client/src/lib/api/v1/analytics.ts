import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

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

export async function getSpendingHeatmap(daysBack?: number): Promise<SpendingHeatmapResponse> {
  const query = typeof daysBack === "number" ? `?days_back=${daysBack}` : "";
  return apiClient(`/v1/analytics/spending-heatmap${query}`);
}

export async function getCategoryTrends(months?: number): Promise<CategoryTrendsResponse> {
  const query = typeof months === "number" ? `?months=${months}` : "";
  return apiClient(`/v1/analytics/category-trends${query}`);
}

export async function getIncomeExpenseSummary(months?: number): Promise<IncomeExpenseResponse> {
  const query = typeof months === "number" ? `?months=${months}` : "";
  return apiClient(`/v1/analytics/income-expense${query}`);
}

export async function getAccountBalances(): Promise<AccountBalancesResponse> {
  return apiClient("/v1/analytics/account-balances");
}

export async function getTopMerchants(params?: { limit?: number; months?: number }): Promise<TopMerchantsResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.months) search.set("months", String(params.months));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/analytics/top-merchants${suffix}`);
}
