import { apiClient } from "./core";

export type TransactionType = "income" | "expense" | "investment";
export type MutationOrigin =
  | "manual"
  | "csv_import"
  | "receipt_ocr"
  | "journal"
  | "task_completion"
  | "ai_plan";

export interface MutationSource {
  origin: MutationOrigin;
  request_id?: string;
  task_id?: string;
  agent_output_id?: string;
  receipt_id?: string;
  journal_entry_id?: string;
  action_link_id?: string;
  actor_type?: "user" | "system" | "agent";
  source_ref?: string;
  note?: string;
}

export interface TransactionPayload {
  amount: number;
  category: string;
  description: string;
  type: TransactionType;
  date?: string;
}

export interface TransactionsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  type?: TransactionType;
  category?: string;
}

export interface TransactionsResponse {
  transactions: Array<{
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    type: TransactionType;
    source?: MutationSource;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getTransactions(query: TransactionsQuery = {}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();

  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.type) params.set("type", query.type);
  if (query.category) params.set("category", query.category);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient(`/transactions${suffix}`);
}

export interface RecentTransactionsResponse {
  transactions: TransactionsResponse["transactions"];
}

export async function getRecentTransactions(limit = 5): Promise<RecentTransactionsResponse> {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
  return apiClient(`/transactions/recent?limit=${safeLimit}`);
}

export interface TransactionsSummaryResponse {
  period: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
    groupBy: string;
  };
  monthly: Array<{
    month: string; // YYYY-MM
    income: number;
    expense: number;
    net: number;
  }>;
  top_categories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  top_categories_month: string; // YYYY-MM
  cache_hit?: boolean;
}

export async function getTransactionsSummary(params: {
  from: string;
  to: string;
  groupBy?: "month";
  topCategories?: number;
}): Promise<TransactionsSummaryResponse> {
  const groupBy = params.groupBy || "month";
  const top = Math.max(1, Math.min(20, Number(params.topCategories) || 6));
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    groupBy,
    topCategories: String(top),
  });
  return apiClient(`/transactions/summary?${qs.toString()}`);
}

export interface DashboardSummaryResponse {
  generated_at: string;
  cash_flow: {
    monthly_income: number;
    monthly_expenses: number;
    net: number;
    savings_rate_pct: number;
  };
  savings: {
    balance: number;
    emergency_fund_months: number | null;
  };
  goals: {
    total_count: number;
    on_track: number;
    total_target: number;
    total_current: number;
    progress_pct: number;
  };
  spending: {
    current_month_total: number;
    previous_month_total: number;
    change_pct: number;
    top_categories: Array<{ category: string; amount: number }>;
  };
  tasks: {
    open: number;
    completed: number;
    dismissed: number;
    upcoming: Array<{ id: string; title: string; dueDate?: string; priority: string }>;
  };
  completeness: {
    has_income: boolean;
    has_expenses: boolean;
    has_goals: boolean;
    has_debts: boolean;
    has_transactions: boolean;
  };
}

export const getDashboardSummary = async (): Promise<DashboardSummaryResponse> => {
  return apiClient("/dashboard/summary");
};

export interface PortfolioSummaryResponse {
  generated_at: string;
  summary: {
    total_invested: number;
    monthly_sip_estimate: number;
    current_month_invested: number;
    previous_month_invested: number;
    month_over_month_change_pct: number;
    total_return_pct: number | null;
    returns_basis: string;
  };
  allocations: Array<{ name: string; amount: number; percentage: number }>;
  holdings: Array<{
    name: string;
    asset_class: string;
    invested_amount: number;
    weight_percentage: number;
  }>;
  performance: Array<{ month: string; invested: number; cumulative: number }>;
  assumptions: string[];
}

export const getPortfolioSummary = async (params: { months?: number } = {}): Promise<PortfolioSummaryResponse> => {
  const months = Number.isFinite(Number(params.months)) ? Math.min(Math.max(1, Number(params.months)), 36) : 12;
  return apiClient(`/portfolio/summary?months=${months}`);
};

export async function createTransaction(payload: TransactionPayload): Promise<any> {
  return apiClient("/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTransaction(id: string, payload: Partial<TransactionPayload>): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTransaction(id: string): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "DELETE",
  });
}

export async function importTransactions(rows: Array<Required<TransactionPayload>>): Promise<{ inserted: number }> {
  return apiClient("/transactions/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

