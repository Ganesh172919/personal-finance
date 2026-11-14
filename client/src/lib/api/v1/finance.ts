/**
 * @fileoverview V1 Finance Accounts API
 *
 * The largest API module -- manages the core financial domain entities:
 * accounts, merchants, budget allocations, recurring rules, and forecasts.
 * All endpoints are scoped to the active organisation via the `apiClient`.
 *
 * Sections:
 * 1. **Accounts** -- Bank/financial accounts (checking, savings, credit,
 *    brokerage, cash) with full CRUD and balance tracking.
 * 2. **Merchants** -- Normalised merchant records with aliases and default
 *    categories, used for transaction classification.
 * 3. **Budget Allocations** -- Per-period, per-category spending limits
 *    (e.g., "Groceries: $500 for 2026-05"). Uses PUT for upsert semantics.
 * 4. **Recurring Rules** -- Cron-based rules that model expected recurring
 *    transactions (rent, subscriptions, etc.) for forecasting.
 * 5. **Budget Envelopes** -- A read-only view that compares planned vs.
 *    actual spending per category for a given period.
 * 6. **Recurring Candidates** -- Server-side analysis that detects patterns
 *    in transaction history and suggests new recurring rules.
 * 7. **Forecast** -- Projected income/expense/net for upcoming months,
 *    incorporating recurring rules and historical averages.
 */

import { apiClient } from "../core";

/** Supported financial account types. */
// Defines supported financial institution account classification types.
// Distinguishes checking deposits, savings reserves, credit lines, brokerage, and physical cash.
// Controls balance sign conventions and account behavior across ledgers.
export type AccountType = "checking" | "savings" | "credit" | "brokerage" | "cash";
// Represents the operational lifecycle status of a financial account.
// Distinguishes active accounts accepting entries from archived or closed accounts.
// Enforces transaction posting restrictions when accounts are closed.
export type AccountStatus = "active" | "closed";

/** ─── Accounts ─────────────────────────────────────────────────── */

/** Full representation of a financial account. */
// Represents a comprehensive bank or credit account entity within the active organization.
// Tracks current ledger balances, reconciled statements, masked account numbers, and metadata.
// Serves as the authoritative source for cash management and balance calculations.
export type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  currency: string;
  mask: string | null;
  opening_balance: number;
  current_balance: number;
  transaction_count: number;
  last_statement_balance: number | null;
  last_statement_date: string | null;
  last_reconciled_at: string | null;
  status: AccountStatus;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

// Encapsulates the response payload containing all organization financial accounts.
// Delivers the account list array alongside the server request tracking identifier.
// Feeds account selector dropdowns and account summary tables in the user interface.
export type ListAccountsResponse = {
  org_id: string;
  accounts: Account[];
  request_id: string;
};

// Defines parameters required to register a new financial account in the system.
// Captures user-assigned name, institution branding, currency code, and account type.
// Validates account initialization fields prior to provisioning in the database.
export type CreateAccountRequest = {
  name: string;
  institution?: string;
  type?: AccountType;
  currency?: string;
  mask?: string;
  metadata?: Record<string, unknown>;
};

// Encapsulates the confirmation payload returned upon successful account registration.
// Returns the newly provisioned account entity with initialized zero balances.
// Immediately updates client account stores and navigation views with the new account.
export type CreateAccountResponse = {
  org_id: string;
  account: Account;
  request_id: string;
};

// Defines editable attributes for modifying an existing financial account record.
// Supports partial updates to institution names, account types, masks, and active statuses.
// Enables safe attribute modification without overwriting unprovided account properties.
export type UpdateAccountRequest = Partial<CreateAccountRequest> & { status?: AccountStatus };

// Encapsulates the server response returned after modifying account properties.
// Returns the modified account record reflecting applied attribute updates.
// Refreshes cached account states and header summaries across client views.
export type UpdateAccountResponse = {
  org_id: string;
  account: Account;
  request_id: string;
};

// Retrieves all financial accounts registered under the active organization.
// Dispatches an authenticated GET request loading complete account records.
// Populates accounts overview dashboards, net worth cards, and transaction forms.
/** Fetch all accounts for the active organisation. */
export async function listAccounts(): Promise<ListAccountsResponse> {
  return apiClient("/finance/accounts");
}

// Provisions a new financial account under the current active organization.
// Dispatches an authenticated POST request transmitting account registration parameters.
// Returns the initialized account entity to update local client state stores.
/** Create a new financial account. */
export async function createAccount(body: CreateAccountRequest): Promise<CreateAccountResponse> {
  return apiClient("/finance/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Modifies selected metadata or status attributes of an existing account by ID.
// Dispatches an authenticated PATCH request submitting partial account updates.
// Refreshes account attributes and notifies dependent cash flow components.
/** Partially update an existing account. */
export async function updateAccount(accountId: string, body: UpdateAccountRequest): Promise<UpdateAccountResponse> {
  return apiClient(`/finance/accounts/${encodeURIComponent(accountId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** ─── Merchants ────────────────────────────────────────────────── */

/** Normalised merchant record with aliases for fuzzy matching. */
// Represents a normalized merchant entity enriched with alias variations and category mappings.
// Aggregates varied merchant text strings into a single canonical brand reference.
// Powers automatic transaction classification and merchant spend concentration reports.
export type Merchant = {
  id: string;
  name: string;
  normalized_name: string;
  category_default: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

// Encapsulates the response payload containing normalized organization merchant entities.
// Delivers merchant record lists matching optional search queries and limit caps.
// Supplies merchant suggestions and autocomplete options across transaction forms.
export type ListMerchantsResponse = {
  org_id: string;
  merchants: Merchant[];
  request_id: string;
};

// Defines parameters required to register or update a normalized merchant entity.
// Supports canonical names, default expense categories, and alternative textual aliases.
// Enforces brand consistency across varied statement description strings.
export type UpsertMerchantRequest = {
  name: string;
  category_default?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

// Encapsulates the response produced after inserting or modifying a merchant record.
// Delivers the updated canonical merchant entity and server request identifier.
// Confirms classification rule updates and updates local merchant caches.
export type UpsertMerchantResponse = {
  org_id: string;
  merchant: Merchant;
  request_id: string;
};

// Queries registered merchants matching optional textual search criteria and limits.
// Formulates URL query parameters for fuzzy text filtering and maximum results.
// Dispatches an authenticated GET request returning canonical merchant listings.
/** List merchants with optional text search and limit. */
export async function listMerchants(params?: { q?: string; limit?: number }): Promise<ListMerchantsResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/merchants${suffix}`);
}

// Registers a new merchant or updates alias definitions for an existing merchant.
// Dispatches an authenticated POST request with canonical naming and categories.
// Reclassifies associated historical transactions and updates rule lookups.
/** Create or update a merchant (upsert by name). */
export async function upsertMerchant(body: UpsertMerchantRequest): Promise<UpsertMerchantResponse> {
  return apiClient("/finance/merchants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** ─── Budget Allocations ───────────────────────────────────────── */

/** A single budget allocation: a spending limit for one category in one period. */
// Defines a designated spending limit for an individual expense category within a cycle.
// Binds target monetary limits to a specific calendar period key and currency code.
// Governs monthly budget progress bars and envelope burn rate evaluations.
export type BudgetAllocation = {
  id: string;
  period_key: string;
  category: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

// Encapsulates the response payload containing category budget allocations for a period.
// Delivers active allocations, conversion exchange rates, and request identifiers.
// Powers monthly budget breakdown views and budget planning spreadsheet editors.
export type ListBudgetAllocationsResponse = {
  org_id: string;
  period_key: string;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  allocations: BudgetAllocation[];
  request_id: string;
};

// Defines parameters for creating or modifying a category spending allowance.
// Transmits the category identifier, designated limit amount, and currency.
// Supports upsert semantics to ensure seamless budget modifications per period.
export type UpsertBudgetAllocationRequest = {
  category: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

// Encapsulates the result returned after creating or updating a category budget limit.
// Returns the persisted budget allocation entity associated with the target period.
// Updates local budget tables and recalculates overall monthly planned spending.
export type UpsertBudgetAllocationResponse = {
  org_id: string;
  period_key: string;
  allocation: BudgetAllocation;
  request_id: string;
};

// Retrieves all category spending allocations configured for a specific billing period.
// Formulates query parameters for pagination limits and currency conversion targets.
// Dispatches an authenticated GET request populating period budgeting interfaces.
/** List budget allocations for a given period (e.g., "2026-05"). */
export async function listBudgetAllocations(
  periodKey: string,
  params?: { limit?: number; currency?: string }
): Promise<ListBudgetAllocationsResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  if (params?.currency) search.set("currency", params.currency);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/budgets/${encodeURIComponent(periodKey)}/allocations${suffix}`);
}

// Creates or overwrites a category spending limit for a specified budget period.
// Dispatches an authenticated PUT request with target category and allocation amounts.
// Recalculates total planned expenditure for the designated calendar period.
/** Create or update a budget allocation for a category in a period (PUT = upsert). */
export async function upsertBudgetAllocation(
  periodKey: string,
  body: UpsertBudgetAllocationRequest
): Promise<UpsertBudgetAllocationResponse> {
  return apiClient(`/finance/budgets/${encodeURIComponent(periodKey)}/allocations`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// Encapsulates confirmation data produced upon removing a category budget allocation.
// Delivers the deleted allocation ID, period key, and affected category name.
// Confirms removal of the spending limit and updates envelope calculations.
export type DeleteBudgetAllocationResponse = {
  message: string;
  deleted_id: string;
  period_key: string;
  category: string;
  request_id?: string;
};

// Removes a designated category budget allocation from a specified billing period.
// Dispatches an authenticated DELETE request addressing the allocation ID.
// Reverts the category to an unbudgeted state for the given calendar period.
/** Delete a budget allocation by ID for a period. */
export async function deleteBudgetAllocation(
  periodKey: string,
  id: string
): Promise<DeleteBudgetAllocationResponse> {
  return apiClient(`/finance/budgets/${encodeURIComponent(periodKey)}/allocations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Defines an individual funding shift instruction between two budget categories.
// Identifies source surplus envelope, recipient deficit envelope, and shift amount.
// Serves as an atomic transfer instruction in automated envelope rebalancing operations.
export type EnvelopeRebalanceTransferInput = {
  from_category: string;
  to_category: string;
  amount: number;
};

// Encapsulates a batch transfer payload to rebalance budget envelopes across categories.
// Delivers an array of transfer instructions shifting funds without raising total budget.
// Executes zero-sum funding adjustments to stabilize over-burned category allocations.
export type RebalanceBudgetAllocationsRequest = {
  transfers: EnvelopeRebalanceTransferInput[];
};

// Represents the adjusted state of a single category budget envelope after rebalancing.
// Captures previous allowance sums, delta changes, and new effective funding limits.
// Demonstrates how surpluses were redistributed to cover category overspends.
export type RebalancedAllocationResult = {
  category: string;
  amount: number;
  currency: string;
  previous_amount: number;
  delta: number;
};

// Encapsulates the outcome of an automated envelope rebalancing operation.
// Reports total funds shifted, count of executed transfers, and updated allocations.
// Powers confirmation summaries displayed after executing automated envelope balancing.
export type RebalanceBudgetAllocationsResponse = {
  message: string;
  period_key: string;
  transfers_executed: number;
  total_rebalanced: number;
  allocations: RebalancedAllocationResult[];
  request_id?: string;
};

// Dynamically shifts funds between budget envelopes without altering total planned budget.
// Dispatches an authenticated POST request delivering category transfer instructions.
// Returns updated envelope limits and delta changes across all adjusted categories.
/**
 * Dynamically rebalance category budget envelopes for a period without altering total planned budget.
 * Moves funds from surplus/under-burned envelopes to deficit/over-burned envelopes.
 */
export async function rebalanceBudgetAllocations(
  periodKey: string,
  body: RebalanceBudgetAllocationsRequest
): Promise<RebalanceBudgetAllocationsResponse> {
  return apiClient(`/finance/budgets/${encodeURIComponent(periodKey)}/rebalance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** ─── Recurring Rules ──────────────────────────────────────────── */

// Defines activation states for automated recurring transaction rules.
// Distinguishes active scheduling rules from temporarily paused or disabled rules.
// Prevents disabled recurring templates from influencing financial forecasting models.
export type RecurringRuleStatus = "active" | "disabled";

// Represents a persistent recurring rule defining scheduled transaction occurrences.
// Encapsulates standard cron scheduling expressions, merchant IDs, and price bounds.
// Drives cash flow forecasting models and predictive calendar expense schedules.
export type RecurringRule = {
  id: string;
  status: RecurringRuleStatus;
  name: string;
  cron: string;
  merchant_id: string | null;
  merchant_name: string | null;
  category: string | null;
  amount_min: number | null;
  amount_max: number | null;
  next_run_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

// Encapsulates the response payload containing all registered recurring transaction rules.
// Delivers the array of recurring rules alongside the server request identifier.
// Feeds recurring expense tables and subscription management settings panels.
export type ListRecurringRulesResponse = {
  org_id: string;
  rules: RecurringRule[];
  request_id: string;
};

// Defines parameters required to establish a new recurring transaction pattern rule.
// Captures friendly rule names, cron schedules, merchant bindings, and amount ranges.
// Validates cron syntax and boundary ranges prior to persisting the recurring rule.
export type CreateRecurringRuleRequest = {
  name: string;
  cron: string;
  status?: RecurringRuleStatus;
  merchant_id?: string;
  merchant_name?: string;
  category?: string;
  amount_min?: number;
  amount_max?: number;
  next_run_at?: string;
  metadata?: Record<string, unknown>;
};

// Encapsulates the response returned upon successful creation of a recurring rule.
// Delivers the persisted recurring rule complete with calculated next execution dates.
// Updates local subscription lists and re-evaluates upcoming forecast projections.
export type CreateRecurringRuleResponse = {
  org_id: string;
  rule: RecurringRule;
  request_id: string;
};

// Defines mutable attributes for modifying an existing recurring transaction rule.
// Supports partial updates to cron schedules, merchant linkages, and price bounds.
// Enables fine-grained tuning of recurring templates without re-creating rules.
export type UpdateRecurringRuleRequest = Partial<CreateRecurringRuleRequest>;

// Encapsulates the response payload returned after modifying a recurring rule.
// Returns the updated recurring rule entity reflecting modified cadence or amounts.
// Recalculates forward-looking cash flow projections based on revised parameters.
export type UpdateRecurringRuleResponse = {
  org_id: string;
  rule: RecurringRule;
  request_id: string;
};

// Retrieves all configured recurring transaction rules for the active organization.
// Formulates query parameters for maximum result limits.
// Dispatches an authenticated GET request loading active and disabled recurring rules.
/** List all recurring transaction rules. */
export async function listRecurringRules(params?: { limit?: number }): Promise<ListRecurringRulesResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/recurring${suffix}`);
}

// Creates a new recurring transaction template governed by a cron schedule.
// Dispatches an authenticated POST request with scheduling and merchant criteria.
// Returns the newly registered rule to integrate into forward-looking forecasts.
/** Create a new recurring transaction rule with a cron schedule. */
export async function createRecurringRule(body: CreateRecurringRuleRequest): Promise<CreateRecurringRuleResponse> {
  return apiClient("/finance/recurring", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Modifies scheduling, category, or amount boundaries on an existing recurring rule.
// Dispatches an authenticated PATCH request with updated rule parameters.
// Refreshes the recurring template and updates upcoming projection intervals.
/** Partially update an existing recurring rule. */
export async function updateRecurringRule(ruleId: string, body: UpdateRecurringRuleRequest): Promise<UpdateRecurringRuleResponse> {
  return apiClient(`/finance/recurring/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** ─── Budget Envelopes (read-only view) ────────────────────────── */

/** One row in the budget envelope view: planned vs. actual per category. */
// Represents an individual category row within the budget envelope analysis view.
// Contrasts planned budget limits against actual period spending to compute remaining funds.
// Identifies unbudgeted categories where expenses occurred without predefined limits.
export type BudgetEnvelopeRow = {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  currency: string;
  tx_count: number;
  unbudgeted: boolean;
};

// Encapsulates consolidated envelope summary totals for a budget cycle.
// Aggregates total planned spending, actual expenditure, remaining balances, and unbudgeted sums.
// Supplies top-level solvency indicators for monthly envelope accounting views.
export type BudgetEnvelopesTotals = {
  planned: number;
  spent: number;
  remaining: number;
  unbudgeted_spent: number;
};

// Encapsulates the complete budget envelope report payload for a calendar period.
// Combines organization identifiers, period keys, macro totals, and category envelope rows.
// Drives the primary envelope budgeting dashboard and category progress bars.
export type BudgetEnvelopesResponse = {
  org_id: string;
  period_key: string;
  currency: string;
  fx_rate?: number;
  currency_symbol?: string;
  totals: BudgetEnvelopesTotals;
  envelopes: BudgetEnvelopeRow[];
  request_id: string;
};

// Fetches the read-only budget envelope view comparing planned versus actual spending.
// Formulates query parameters for currency conversions and localized symbols.
// Dispatches an authenticated GET request loading envelope rows and summary totals.
/** Fetch the budget envelope view: planned vs. actual spending per category for a period. */
export async function getBudgetEnvelopes(
  periodKey: string,
  currency?: string,
  options?: { fresh?: boolean },
): Promise<BudgetEnvelopesResponse> {
  const search = new URLSearchParams();
  if (currency) search.set("currency", currency);
  if (options?.fresh) search.set("fresh", "true");
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/budgets/${encodeURIComponent(periodKey)}/envelopes${suffix}`);
}

/** ─── Recurring Candidates (server-side pattern detection) ──────── */

/** A suggested recurring rule derived from detected transaction patterns. */
// Defines a pre-populated recurring rule blueprint suggested by pattern analysis.
// Encapsulates suggested cron cadences, canonical merchant bindings, and price boundaries.
// Enables single-click conversion of discovered recurring patterns into active rules.
export type RecurringRuleSuggestion = {
  name: string;
  cron: string;
  status: "active";
  merchant_id?: string;
  merchant_name?: string;
  category?: string;
  amount_min?: number;
  amount_max?: number;
};

// Represents a detected recurring spending pattern discovered from ledger transaction logs.
// Tracks detection confidence scores, repetition frequencies, date spreads, and sample descriptions.
// Provides historical rationale explaining why an expense pattern was flagged as recurring.
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
  suggested_rule: RecurringRuleSuggestion;
  rationale: string[];
};

// Encapsulates the response payload containing detected recurring transaction candidates.
// Delivers organization identifiers, lookback evaluation days, and candidate arrays.
// Powers subscription discovery views and recurring expense optimization assistants.
export type RecurringCandidatesResponse = {
  org_id: string;
  days_back: number;
  candidates: RecurringCandidate[];
  request_id: string;
};

// Analyzes past transaction history to identify recurring expenditure patterns.
// Formulates query parameters for historical lookback windows and minimum occurrence counts.
// Dispatches an authenticated GET request loading algorithmic recurring candidates.
/** Detect recurring transaction patterns and suggest new recurring rules. */
export async function listRecurringCandidates(params?: {
  days_back?: number;
  limit?: number;
  min_occurrences?: number;
}): Promise<RecurringCandidatesResponse> {
  const search = new URLSearchParams();
  if (typeof params?.days_back === "number") search.set("days_back", String(params.days_back));
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  if (typeof params?.min_occurrences === "number") search.set("min_occurrences", String(params.min_occurrences));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/recurring/candidates${suffix}`);
}

/** ─── Forecast ─────────────────────────────────────────────────── */

/** One category's average monthly expense in the forecast. */
// Represents an individual category's historical monthly expense baseline.
// Supplies average monthly outflow statistics incorporated into forecasting models.
// Used to model category-level spending projections over upcoming months.
export type ForecastCategoryRow = {
  category: string;
  expense_monthly_avg: number;
};

// Evaluates budget envelope stress and projected overspending for a category.
// Contrasts current elapsed month progress with burn rate percentages.
// Categorizes pressure severity as watch, at risk, or over budget.
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

// Encapsulates an early-warning financial risk notification generated by forecasting.
// Classifies severity from informational notices up to critical deficit alerts.
// Supplies actionable guidance to preempt upcoming cash shortfalls or budget overshoots.
export type ForecastRiskAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  recommended_action: string;
  category?: string;
  amount?: number;
};

// Defines a prioritized financial intervention recommended to optimize cash trajectory.
// Quantifies estimated monetary impact and assigns execution priority levels.
// Surfaces targeted recommendations on financial planning overview dashboards.
export type ForecastActionItem = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  impact_estimate: number | null;
};

// Encapsulates comprehensive forward-looking financial forecasting projections.
// Integrates historical baseline averages, recurring rules, and monthly cash curves.
// Delivers multi-month liquidity trajectories, budget pressures, and risk alerts.
export type ForecastResponse = {
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
  request_id: string;
};

// Generates a multi-month financial forecast incorporating historical trends and rules.
// Formulates query parameters for projection horizon length, categories, and currency.
// Dispatches an authenticated GET request returning forward-looking liquidity simulations.
/** Fetch a financial forecast: projected income/expense/net for upcoming months. */
export async function getForecast(params?: {
  period_key?: string;
  months?: number;
  top_categories?: number;
  currency?: string;
}): Promise<ForecastResponse> {
  const search = new URLSearchParams();
  if (params?.period_key) search.set("period_key", params.period_key);
  if (typeof params?.months === "number") search.set("months", String(params.months));
  if (typeof params?.top_categories === "number") search.set("top_categories", String(params.top_categories));
  if (params?.currency) search.set("currency", params.currency);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/finance/forecast${suffix}`);
}
