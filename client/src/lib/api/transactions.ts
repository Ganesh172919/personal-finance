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

import type { SupportedCurrency } from "@/lib/currencyFx";
import { apiClient } from "./core";

// Defines primary classification categories for financial transactions.
// Distinguishes top-level inflows, regular expense outflows, and asset investments.
// Drives foundational ledger reporting aggregates and balance sheet calculations.
/** Transaction category type */
export type TransactionType = "income" | "expense" | "investment";

// Identifies originating sources and creation channels for transaction entries.
// Distinguishes user manual entries, CSV imports, receipts, AI tasks, and connectors.
// Supplies provenance metadata for downstream auditing and data integrity checks.
/** How a transaction was created — tracks data provenance */
export type MutationOrigin =
  | "manual"          // User entered via form
  | "csv_import"      // Bulk imported from CSV file
  | "receipt_ocr"     // Created from receipt scan
  | "journal"         // Created from financial journal entry
  | "task_completion" // Created when user completed an AI-suggested task
  | "ai_plan"         // Created by an AI-generated plan
  | "connector";      // Synced from a bank connector

// Tracks comprehensive audit lineage and attribution metadata for transaction records.
// Links entries to initiating tasks, OCR scans, journal logs, and automated actors.
// Preserves contextual source references to facilitate transaction verification.
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

// Defines the payload specification for creating or editing ledger transactions.
// Encapsulates transactional values, categorization keys, descriptions, and splits.
// Provides structured input validation for manual and automated transaction entry.
export interface TransactionPayload {
  amount: number;
  category: string;
  description: string;
  type: TransactionType;
  date?: string;
  splits?: Array<{
    category: string;
    amount: number;
  }>;
}

// Specifies query filter parameters for paginated transaction ledger searches.
// Supports date interval filtering, transaction types, categories, and review flags.
// Supplies criteria for populating filtered financial views and review queues.
export interface TransactionsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  type?: TransactionType;
  category?: string;
  needs_review?: boolean;
  review_flag?: "uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate";
  currency?: string;
}

// Encapsulates paginated transaction query results with conversion metadata.
// Delivers transaction arrays, split details, review warnings, and pagination offsets.
// Supplies core ledger data feeds to transaction review lists and table views.
export interface TransactionsResponse {
  transactions: Array<{
    id: string;
    amount: number;
    raw_amount?: number;
    currency?: string;
    fx_rate?: number;
    currency_symbol?: string;
    category: string;
    description: string;
    date: string;
    type: TransactionType;
    splits?: Array<{
      category: string;
      amount: number;
      raw_amount?: number;
    }>;
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
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
}

// Queries paginated transaction records matching specified filter parameters.
// Serializes search filters into an encoded URL query parameter string.
// Dispatches an authenticated GET request returning matching ledger records.
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
  if (query.currency) params.set("currency", query.currency);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient(`/transactions${suffix}`);
}

// Represents the payload containing latest user transactions for dashboard display.
// Delivers a truncated slice of recent transaction records without pagination details.
// Feeds quick-access activity feeds on overview summaries and sidebar widgets.
export interface RecentTransactionsResponse {
  transactions: TransactionsResponse["transactions"];
}

// Fetches the most recent transaction entries up to a specified maximum limit.
// Clamps the requested record count within safe numerical boundary limits.
// Dispatches an authenticated GET request loading recent activity snapshots.
export async function getRecentTransactions(limit = 5): Promise<RecentTransactionsResponse> {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
  return apiClient(`/transactions/recent?limit=${safeLimit}`);
}

// Encapsulates time-series transaction aggregations over defined calendar intervals.
// Summarizes monthly net cash flow metrics and ranking lists of top spending categories.
// Powers visual analytics charts and category breakdown graphs in financial views.
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

// Retrieves aggregate spending summaries and category distributions across date ranges.
// Formulates query parameters for custom date windows and category display caps.
// Dispatches an authenticated GET request returning time-series analytics summaries.
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

// Encapsulates top-level high-level executive dashboard financial metrics.
// Aggregates net cash flow rates, emergency savings cushions, and debt signals.
// Supplies comprehensive financial status indicators for the main application view.
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

// Fetches the overarching dashboard financial snapshot for the authenticated account.
// Dispatches an authenticated GET request aggregating cash flow and goals progress.
// Returns multi-faceted health indicators driving key overview dashboard widgets.
export const getDashboardSummary = async (): Promise<DashboardSummaryResponse> => {
  return apiClient("/dashboard/summary");
};

// Defines dividend payout distributions and yield metrics for an individual investment holding.
// Tracks gross sums, withholding taxes, net payouts, and yield-on-cost percentages.
// Enables granular dividend income attribution across user asset positions.
export interface PortfolioHoldingPayout {
  holding_name: string;
  total_amount: number;
  gross_amount?: number;
  wht_deducted?: number;
  net_amount?: number;
  payout_count: number;
  invested_amount: number;
  yield_on_cost_pct: number;
  net_yield_on_cost_pct?: number;
}

// Encapsulates comprehensive dividend income distributions across investment portfolios.
// Summarizes withholding tax relief, trailing-twelve-month yields, and monthly progression.
// Supplies dividend analytics and recent payout timelines to income investment dashboards.
export interface PortfolioDividendsSummary {
  total_received: number;
  gross_received?: number;
  net_received?: number;
  wht_deducted?: number;
  wht_rate_pct?: number;
  ftc_relief_estimate?: number;
  treaty_country?: string;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  ttm_received: number;
  gross_ttm_received?: number;
  net_ttm_received?: number;
  portfolio_yield_pct: number;
  net_portfolio_yield_pct?: number;
  monthly_average: number;
  net_monthly_average?: number;
  payouts_by_holding: PortfolioHoldingPayout[];
  monthly_progression: Array<{ month: string; amount: number }>;
  recent_payouts: Array<{
    id: string;
    description: string;
    amount: number;
    gross_amount?: number;
    wht_deducted?: number;
    net_amount?: number;
    date: string;
    category: string;
  }>;
}

// Represents the aggregated portfolio allocation, holdings, and performance response payload.
// Delivers asset class weightings, systematic investment estimations, and return metrics.
// Powers portfolio visualization graphs, holding distribution charts, and investment analytics.
export interface PortfolioSummaryResponse {
  generated_at: string;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
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
  dividends?: PortfolioDividendsSummary;
  assumptions: string[];
}

// Queries investment portfolio summaries, allocations, and dividend metrics over time.
// Encodes historical month horizons, currency conversions, and treaty tax rates.
// Dispatches an authenticated GET request fetching comprehensive investment summaries.
export const getPortfolioSummary = async (params: {
  months?: number;
  currency?: SupportedCurrency;
  wht_rate?: number;
  treaty_country?: string;
} = {}): Promise<PortfolioSummaryResponse> => {
  const months = Number.isFinite(params.months) ? Math.min(Math.max(1, Math.trunc(params.months ?? 12)), 36) : 12;
  const query = new URLSearchParams({ months: String(months) });
  if (params.currency) query.set("currency", params.currency);
  if (params.wht_rate !== undefined) query.set("wht_rate", String(params.wht_rate));
  if (params.treaty_country) query.set("treaty_country", params.treaty_country);
  return apiClient(`/portfolio/summary?${query}`);
};

// Submits a new financial transaction payload to append into the user ledger.
// Supports multi-category itemization splits, date timestamps, and transaction types.
// Dispatches an authenticated POST request returning the persisted transaction entity.
export async function createTransaction(payload: TransactionPayload): Promise<any> {
  return apiClient("/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Modifies selected attributes of an existing ledger transaction by ID.
// Accepts partial transaction payloads allowing targeted updates to amounts or categories.
// Dispatches an authenticated PATCH request to update the target transaction record.
export async function updateTransaction(id: string, payload: Partial<TransactionPayload>): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Permanently removes a designated financial transaction from the user ledger.
// Updates running balances and clears associated reconciliation or review statuses.
// Dispatches an authenticated DELETE request with the specified transaction ID.
export async function deleteTransaction(id: string): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "DELETE",
  });
}

// Ingests bulk transaction records imported from external tabular sources or CSV files.
// Delivers normalized transaction arrays in a single batch persistence request.
// Dispatches an authenticated POST request returning the count of inserted records.
export async function importTransactions(rows: Array<Required<TransactionPayload>>): Promise<{ inserted: number }> {
  return apiClient("/transactions/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

// ── Command Center ──────────────────────────────────────────────────────────

// Defines urgency tiers for financial signals and actionable command center alerts.
// Categorizes recommendations into immediate actions, weekly reviews, or low priority.
// Governs notification badge styles, sort priority, and visual alert indicators.
export type PriorityLevel = "act_now" | "review_this_week" | "safe_to_ignore";

// Represents a prioritized alert signal displayed within the user financial command center.
// Packages actionable titles, detailed guidance, urgency tiers, and target navigation URLs.
// Highlights urgent anomalies, bill deadlines, and spending deviations for rapid intervention.
export interface CommandCenterSignal {
  id: string;
  title: string;
  detail: string;
  priority: PriorityLevel;
  metric?: number;
  action_href?: string;
}

// Computes consolidated asset and liability netting balances across connected accounts.
// Aggregates liquid cash, investment reserves, credit card balances, and loan debts.
// Determines overall net worth and calculates net runway days for financial resilience.
export interface ConsolidatedNetting {
  liquid_assets: number;
  investment_assets: number;
  total_assets: number;
  credit_liabilities: number;
  profile_debts: number;
  total_liabilities: number;
  net_liquid_cash: number;
  net_worth: number;
  netting_status: "surplus" | "balanced" | "deficit";
  net_runway_days: number | null;
  account_breakdown?: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
  }>;
}

// Encapsulates real-time daily operational financial metrics for the command center.
// Unpacks cash runway projections, budget burn velocities, pending bills, and alerts.
// Supplies central decision-support data for primary user financial dashboard views.
export interface CommandCenterResponse {
  generated_at: string;
  time_of_day: "morning" | "afternoon" | "evening";
  cash_runway: {
    balance_available?: boolean;
    liquid_balance: number;
    net_liquid_balance?: number;
    avg_daily_expense: number;
    days_remaining: number | null;
    net_days_remaining?: number | null;
    currency: string;
  };
  consolidated_netting?: ConsolidatedNetting;
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

// Retrieves real-time operational overview metrics and urgent financial signals.
// Dispatches an authenticated GET request loading consolidated cash runway and alerts.
// Serves as the primary operational entry point powering command center dashboard cards.
export const getCommandCenter = async (): Promise<CommandCenterResponse> => {
  return apiClient("/command-center");
};

// ── Budget Health ───────────────────────────────────────────────────────────

// Represents budget pacing alerts triggered when spending pace exceeds monthly limits.
// Computes projected month-end overspends and classifies urgency as warning or critical.
// Triggers early intervention warnings within budget tracking and summary interfaces.
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

// Calculates dynamic predictive daily spending thresholds per budget category.
// Evaluates remaining month days, actual burn velocity, and required expense caps.
// Guides users on daily safe-to-spend limits to prevent category budget overshoots.
export interface PredictiveSpendingLimit {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  days_remaining: number;
  current_daily_spend: number;
  safe_daily_spend: number;
  projected_eom: number;
  overshoot_risk: boolean;
  overshoot_amount: number;
  recommended_cap: number;
  daily_reduction_required: number;
  status: "safe" | "caution" | "critical";
}

// Aggregates high-level spending limit health across all monitored budget envelopes.
// Tallies safe daily allowances alongside the count of endangered budget categories.
// Provides a fast overview metric of required daily expense reductions across the ledger.
export interface PredictiveLimitsSummary {
  days_remaining: number;
  total_safe_daily_spend: number;
  categories_at_risk: number;
  total_daily_reduction_required: number;
}

// Defines proactive optimization advice generated by heuristic spending evaluations.
// Proposes concrete actions such as task creation, envelope adjustments, or goal boosts.
// Quantifies potential monthly monetary savings and credit/financial health impacts.
export interface ProactiveSavingsRecommendation {
  id: string;
  title: string;
  category: string;
  impact_monthly_savings: number;
  score_impact_pts: number;
  difficulty: "easy" | "moderate" | "strategic";
  reasoning: string;
  action_type: "create_task" | "adjust_budget" | "boost_goal";
  suggested_task_title: string;
}

// Aggregates potential financial savings from actionable optimization recommendations.
// Summarizes total monthly cash reserves that can be unlocked and credit score boosts.
// Highlights high-impact opportunities on financial health overview screens.
export interface SavingsPotentialSummary {
  total_monthly_savings: number;
  potential_score_improvement: number;
  recommended_actions_count: number;
}

// Compares user spending proportions against demographic peer percentile benchmarks.
// Measures percent-of-income variance relative to median, 25th, and 75th percentiles.
// Labels spending behavior as frugal, aligned, or elevated compared to peer medians.
export interface PeerSpendingBenchmark {
  category: string;
  user_spend: number;
  user_pct_of_income: number;
  peer_median_pct: number;
  peer_p25_pct: number;
  peer_p75_pct: number;
  delta_vs_peer_median: number;
  monthly_dollar_delta: number;
  status: "frugal" | "aligned" | "elevated";
  benchmark_description: string;
}

// Encapsulates overall alignment metrics against anonymized peer comparison groups.
// Summarizes alignment indexes, category distributions, and top savings potentials.
// Feeds comparative financial wellness widgets within budget analysis reports.
export interface PeerBenchmarkingSummary {
  available?: boolean;
  unavailable_reason?: string;
  cohort_name: string | null;
  alignment_index: number | null;
  frugal_categories_count: number | null;
  elevated_categories_count: number | null;
  top_peer_savings_opportunity?: string;
}

// Specifies an internal funding transfer between virtual budgeting envelopes.
// Identifies source surplus categories, deficit recipients, and transfer amounts.
// Automates envelope solvency without increasing total monthly planned expenditures.
export interface EnvelopeRebalanceTransfer {
  from_category: string;
  to_category: string;
  amount: number;
  reason: string;
}

// Captures proposed budget adjustments following envelope rebalancing evaluations.
// Contrasts baseline planned amounts against recommended reallocated targets.
// Classifies whether envelopes receive safety buffers, donate surpluses, or stay balanced.
export interface ProposedAllocation {
  category: string;
  current_planned: number;
  recommended_planned: number;
  delta: number;
  status: "deficit_buffered" | "surplus_donated" | "balanced";
}

// Defines a comprehensive automated rebalancing proposal across budget categories.
// Recommends category-to-category transfers to mitigate overspent budget envelopes.
// Preserves overall monthly spending constraints while stabilizing volatile categories.
export interface AutoRebalancePlan {
  period_key: string;
  needed: boolean;
  transfers: EnvelopeRebalanceTransfer[];
  proposed_allocations: ProposedAllocation[];
  total_rebalanced_amount: number;
  envelopes_stabilized: number;
  budget_preserved: boolean;
}

// Encapsulates comprehensive health scores, pace analyses, and budget alerts.
// Combines burn-rate alerts, peer comparisons, rebalance plans, and month-end projections.
// Delivers the primary analytical payload driving budget health inspection dashboards.
export interface BudgetHealthResponse {
  generated_at: string;
  period_key: string;
  health_score: {
    data_available?: boolean;
    total: number;
    budget_adherence: number;
    review_cleanliness: number;
    goal_progress: number;
    debt_management: number;
  };
  burn_rate_alerts: BurnRateAlert[];
  predictive_spending_limits?: PredictiveSpendingLimit[];
  predictive_limits_summary?: PredictiveLimitsSummary;
  proactive_savings_recommendations?: ProactiveSavingsRecommendation[];
  savings_potential_summary?: SavingsPotentialSummary;
  peer_benchmarks?: PeerSpendingBenchmark[];
  peer_benchmarking_summary?: PeerBenchmarkingSummary;
  auto_rebalance_plan?: AutoRebalancePlan;
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

// Retrieves comprehensive budget performance metrics and predictive spending health.
// Dispatches an authenticated GET request loading burn rates and peer benchmark trends.
// Serves as the central data provider for financial health scoring interfaces.
export const getBudgetHealth = async (): Promise<BudgetHealthResponse> => {
  return apiClient("/budget-health");
};

// ── Transaction Review Actions ──────────────────────────────────────────────

// Marks a flagged transaction as approved and removes it from the review queue.
// Dispatches an authenticated POST request confirming the target transaction record.
// Updates transaction review state to indicate manual user verification.
export const approveTransaction = async (id: string): Promise<any> => {
  return apiClient(`/transactions/${id}/approve`, { method: "POST" });
};

// Approves a batch of flagged transactions in a single atomic operation.
// Dispatches an authenticated POST request delivering a list of transaction IDs.
// Returns the count of successfully reviewed and updated transaction records.
export const bulkApproveTransactions = async (transactionIds: string[]): Promise<{ modified: number }> => {
  return apiClient("/transactions/bulk-approve", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
};

// Permanently removes multiple transaction records in a single batch request.
// Dispatches an authenticated POST request containing target transaction identifiers.
// Returns confirmation status and the total count of purged ledger entries.
export const bulkDeleteTransactions = async (
  transactionIds: string[]
): Promise<{ message: string; deleted_count: number }> => {
  return apiClient("/transactions/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
};

// Reassigns the spending category for an array of specified transaction IDs.
// Dispatches an authenticated POST request with transaction IDs and target category.
// Updates all designated records and returns modification totals for confirmation.
export const bulkCategorizeTransactions = async (
  transactionIds: string[],
  category: string
): Promise<{ message: string; modified_count: number; category: string }> => {
  return apiClient("/transactions/bulk-categorize", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds, category }),
  });
};

// Establishes a permanent automated categorization rule based on a transaction.
// Dispatches an authenticated POST request learning merchant-to-category mappings.
// Automatically classifies future matching transactions without manual triage.
export const alwaysCategorize = async (id: string): Promise<any> => {
  return apiClient(`/transactions/${id}/always-categorize`, { method: "POST" });
};

// Represents a grouped cluster of similar merchant descriptions discovered by NLP.
// Aggregates raw text variations, total expenditure sums, and suggested categories.
// Facilitates bulk normalization and automatic classification of recurring merchants.
export interface MerchantCluster {
  cluster_key: string;
  normalized_name: string;
  raw_descriptions: string[];
  transaction_ids: string[];
  count: number;
  total_spend: number;
  suggested_category: string;
  confidence: number;
  semantic_similarity?: number;
}

// Encapsulates detected merchant groupings along with conversion exchange metrics.
// Delivers cluster collections, occurrence frequencies, and total count metadata.
// Powers merchant cleanup interfaces and transaction categorization assistants.
export interface MerchantClustersResponse {
  clusters: MerchantCluster[];
  total_clusters: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
}

// Queries discovered merchant similarity clusters constrained by occurrence count.
// Formulates URL query parameters for minimum occurrence thresholds and record limits.
// Dispatches an authenticated GET request returning clustered merchant groupings.
export async function getMerchantClusters(
  query: { min_count?: number; limit?: number; currency?: string } = {}
): Promise<MerchantClustersResponse> {
  const params = new URLSearchParams();
  if (query.min_count !== undefined) params.set("min_count", String(query.min_count));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.currency) params.set("currency", query.currency);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient(`/transactions/merchant-clusters${suffix}`);
}

// Commits standardized merchant names and assigned categories to clustered transactions.
// Dispatches an authenticated POST request with cluster definitions and transaction IDs.
// Returns execution metrics confirming the quantity of updated transaction entries.
export async function applyMerchantCluster(body: {
  cluster_key: string;
  normalized_name: string;
  category: string;
  transaction_ids: string[];
}): Promise<{ success: boolean; updated_count: number; normalized_name: string; category: string }> {
  return apiClient("/transactions/merchant-clusters/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Defines individual transaction payloads received via external banking webhooks.
// Captures institution identifiers, transaction amounts, timestamps, and merchant names.
// Normalizes third-party data feeds for automated ingestion into the central ledger.
export interface BankFeedTransactionInput {
  transaction_id: string;
  amount: number;
  date: string;
  name: string;
  category?: string[];
  pending?: boolean;
  account_id?: string;
}

// Ingests live financial data streams forwarded from banking aggregators or webhooks.
// Dispatches an authenticated POST request processing incoming transaction arrays.
// Returns processing totals including newly inserted records and skipped duplicates.
export async function ingestBankFeed(body: {
  webhook_type?: "TRANSACTIONS" | "ITEM" | "AUTH";
  webhook_code: string;
  item_id?: string;
  account_id?: string;
  transactions: BankFeedTransactionInput[];
}): Promise<{ success: boolean; webhook_type: string; webhook_code: string; processed: number; inserted: number; duplicates_skipped: number }> {
  return apiClient("/transactions/bank-feed", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

