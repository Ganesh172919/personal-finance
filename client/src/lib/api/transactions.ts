/**
 * @fileoverview Transaction API Client
 *
 * Functions for CRUD operations on financial transactions, plus dashboard
 * and portfolio summary endpoints. All functions use the shared `apiClient`
 * for consistent auth, error handling, and org context.
 *
 * MUTATION TRACKING:
 * Every transaction can have a `MutationSource` that records how it was
 * created (manual, CSV import, receipt OCR, AI plan, etc.). This enables
 * audit trails and helps users understand where their data came from.
 *
 * QUERY PARAMETERS:
 * Transaction listing supports pagination, date range filtering, type
 * filtering, category filtering, and review status filtering. The
 * `needs_review` flag is used for the transaction review queue.
 *
 * @module lib/api/transactions
 */

import { apiClient } from "./core";

/** Transaction category type */
export type TransactionType = "income" | "expense" | "investment";

/** How a transaction was created — tracks data provenance */
export type MutationOrigin =
  | "manual"          // User entered via form
  | "csv_import"      // Bulk imported from CSV file
  | "receipt_ocr"     // Created from receipt scan
  | "journal"         // Created from financial journal entry
  | "task_completion" // Created when user completed an AI-suggested task
  | "ai_plan"         // Created by an AI-generated plan
  | "connector";      // Synced from a bank connector

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
  needs_review?: boolean;
  review_flag?: "uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate";
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
    review?: {
      needs_attention: boolean;
      flags: Array<"uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate">;
      notes?: string[];
      attention_score?: number;
    };
    reconciliation?: {
      status?: "unreconciled" | "cleared" | "reconciled";
      reference?: string;
      statementDate?: string;
      statementBalance?: number;
      reconciledAt?: string;
    };
    import_details?: {
      importId?: string;
      fileName?: string;
      rowIndex?: number;
      duplicateKey?: string;
      committedAt?: string;
    };
    running_balance?: number;
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
  if (query.needs_review !== undefined) params.set("needs_review", String(query.needs_review));
  if (query.review_flag) params.set("review_flag", query.review_flag);

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
  review_queue: {
    needs_attention: number;
    uncategorized: number;
    needs_merchant_match: number;
    suspected_duplicates: number;
    recurring_candidates: number;
  };
  monthly_close: {
    period_key: string;
    status: string;
    totals: {
      income: number;
      expenses: number;
      net: number;
      tx_count: number;
    };
    budget: null | {
      planned: number;
      spent: number;
      remaining: number;
      unbudgeted_spent: number;
    };
    ready_to_close: boolean;
  };
  signals: {
    anomalies: Array<{
      id: string;
      title: string;
      severity: string;
      metric: number;
      detail: string;
    }>;
    recurring_candidates: Array<{
      id: string;
      title: string;
      confidence: number;
      cadence: string;
    }>;
    upcoming_reminders: number;
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

// ── Command Center ──────────────────────────────────────────────────────────

export type PriorityLevel = "act_now" | "review_this_week" | "safe_to_ignore";

export interface CommandCenterSignal {
  id: string;
  title: string;
  detail: string;
  priority: PriorityLevel;
  metric?: number;
  action_href?: string;
}

export interface CommandCenterResponse {
  generated_at: string;
  time_of_day: "morning" | "afternoon" | "evening";
  cash_runway: {
    liquid_balance: number;
    avg_daily_expense: number;
    days_remaining: number | null;
    currency: string;
  };
  budget_burn: {
    period_key: string;
    total_planned: number;
    total_spent: number;
    burn_rate_pct: number;
    day_of_month: number;
    days_in_month: number;
    month_elapsed_pct: number;
    projected_total: number;
    on_pace: boolean;
    overshoot_amount: number;
    categories_over_budget: Array<{
      category: string;
      planned: number;
      spent: number;
      over_by: number;
    }>;
  };
  upcoming_bills: Array<{
    id: string;
    name: string;
    amount_estimate: number;
    due_date: string;
    category?: string;
  }>;
  risky_subscriptions: Array<{
    id: string;
    description: string;
    amount_avg: number;
    cadence: string;
    confidence: number;
  }>;
  debt_pressure: {
    total_minimum_due: number;
    total_debt_balance: number;
    debt_count: number;
    pressure_level: PriorityLevel;
  };
  pending_tasks: {
    open: number;
    due_soon: number;
    overdue: number;
  };
  goals_snapshot: {
    total: number;
    on_track: number;
    at_risk: number;
    overall_progress_pct: number;
  };
  priority_signals: CommandCenterSignal[];
}

export const getCommandCenter = async (): Promise<CommandCenterResponse> => {
  return apiClient("/command-center");
};

// ── Budget Health ───────────────────────────────────────────────────────────

export interface BurnRateAlert {
  category: string;
  planned: number;
  spent: number;
  burn_rate_pct: number;
  month_elapsed_pct: number;
  projected_end_of_month: number;
  overshoot_amount: number;
  severity: "warning" | "critical";
  message: string;
}

export interface BudgetHealthResponse {
  generated_at: string;
  period_key: string;
  health_score: {
    total: number;
    budget_adherence: number;
    review_cleanliness: number;
    goal_progress: number;
    debt_management: number;
  };
  burn_rate_alerts: BurnRateAlert[];
  pace_comparison: {
    current_week_avg_daily: number;
    last_week_avg_daily: number;
    monthly_avg_daily: number;
    trend: "improving" | "stable" | "worsening";
  };
  projection: {
    if_you_continue: string;
    projected_month_end_spend: number;
    budget_planned: number;
    delta: number;
  };
}

export const getBudgetHealth = async (): Promise<BudgetHealthResponse> => {
  return apiClient("/budget-health");
};

// ── Transaction Review Actions ──────────────────────────────────────────────

export const approveTransaction = async (id: string): Promise<any> => {
  return apiClient(`/transactions/${id}/approve`, { method: "POST" });
};

export const bulkApproveTransactions = async (transactionIds: string[]): Promise<{ modified: number }> => {
  return apiClient("/transactions/bulk-approve", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
};

export const alwaysCategorize = async (id: string): Promise<any> => {
  return apiClient(`/transactions/${id}/always-categorize`, { method: "POST" });
};

