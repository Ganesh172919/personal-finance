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
export type AccountType = "checking" | "savings" | "credit" | "brokerage" | "cash";
export type AccountStatus = "active" | "closed";

/** ─── Accounts ─────────────────────────────────────────────────── */

/** Full representation of a financial account. */
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

export type ListAccountsResponse = {
  org_id: string;
  accounts: Account[];
  request_id: string;
};

export type CreateAccountRequest = {
  name: string;
  institution?: string;
  type?: AccountType;
  currency?: string;
  mask?: string;
  metadata?: Record<string, unknown>;
};

export type CreateAccountResponse = {
  org_id: string;
  account: Account;
  request_id: string;
};

export type UpdateAccountRequest = Partial<CreateAccountRequest> & { status?: AccountStatus };

export type UpdateAccountResponse = {
  org_id: string;
  account: Account;
  request_id: string;
};

/** Fetch all accounts for the active organisation. */
export async function listAccounts(): Promise<ListAccountsResponse> {
  return apiClient("/v1/finance/accounts");
}

/** Create a new financial account. */
export async function createAccount(body: CreateAccountRequest): Promise<CreateAccountResponse> {
  return apiClient("/v1/finance/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Partially update an existing account. */
export async function updateAccount(accountId: string, body: UpdateAccountRequest): Promise<UpdateAccountResponse> {
  return apiClient(`/v1/finance/accounts/${encodeURIComponent(accountId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** ─── Merchants ────────────────────────────────────────────────── */

/** Normalised merchant record with aliases for fuzzy matching. */
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

export type ListMerchantsResponse = {
  org_id: string;
  merchants: Merchant[];
  request_id: string;
};

export type UpsertMerchantRequest = {
  name: string;
  category_default?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

export type UpsertMerchantResponse = {
  org_id: string;
  merchant: Merchant;
  request_id: string;
};

/** List merchants with optional text search and limit. */
export async function listMerchants(params?: { q?: string; limit?: number }): Promise<ListMerchantsResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/finance/merchants${suffix}`);
}

/** Create or update a merchant (upsert by name). */
export async function upsertMerchant(body: UpsertMerchantRequest): Promise<UpsertMerchantResponse> {
  return apiClient("/v1/finance/merchants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** ─── Budget Allocations ───────────────────────────────────────── */

/** A single budget allocation: a spending limit for one category in one period. */
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

export type ListBudgetAllocationsResponse = {
  org_id: string;
  period_key: string;
  allocations: BudgetAllocation[];
  request_id: string;
};

export type UpsertBudgetAllocationRequest = {
  category: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

export type UpsertBudgetAllocationResponse = {
  org_id: string;
  period_key: string;
  allocation: BudgetAllocation;
  request_id: string;
};

/** List budget allocations for a given period (e.g., "2026-05"). */
export async function listBudgetAllocations(
  periodKey: string,
  params?: { limit?: number }
): Promise<ListBudgetAllocationsResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/finance/budgets/${encodeURIComponent(periodKey)}/allocations${suffix}`);
}

/** Create or update a budget allocation for a category in a period (PUT = upsert). */
export async function upsertBudgetAllocation(
  periodKey: string,
  body: UpsertBudgetAllocationRequest
): Promise<UpsertBudgetAllocationResponse> {
  return apiClient(`/v1/finance/budgets/${encodeURIComponent(periodKey)}/allocations`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** ─── Recurring Rules ──────────────────────────────────────────── */

export type RecurringRuleStatus = "active" | "disabled";

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

export type ListRecurringRulesResponse = {
  org_id: string;
  rules: RecurringRule[];
  request_id: string;
};

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

export type CreateRecurringRuleResponse = {
  org_id: string;
  rule: RecurringRule;
  request_id: string;
};

export type UpdateRecurringRuleRequest = Partial<CreateRecurringRuleRequest>;

export type UpdateRecurringRuleResponse = {
  org_id: string;
  rule: RecurringRule;
  request_id: string;
};

/** List all recurring transaction rules. */
export async function listRecurringRules(params?: { limit?: number }): Promise<ListRecurringRulesResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/finance/recurring${suffix}`);
}

/** Create a new recurring transaction rule with a cron schedule. */
export async function createRecurringRule(body: CreateRecurringRuleRequest): Promise<CreateRecurringRuleResponse> {
  return apiClient("/v1/finance/recurring", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Partially update an existing recurring rule. */
export async function updateRecurringRule(ruleId: string, body: UpdateRecurringRuleRequest): Promise<UpdateRecurringRuleResponse> {
  return apiClient(`/v1/finance/recurring/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** ─── Budget Envelopes (read-only view) ────────────────────────── */

/** One row in the budget envelope view: planned vs. actual per category. */
export type BudgetEnvelopeRow = {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  currency: string;
  tx_count: number;
  unbudgeted: boolean;
};

export type BudgetEnvelopesTotals = {
  planned: number;
  spent: number;
  remaining: number;
  unbudgeted_spent: number;
};

export type BudgetEnvelopesResponse = {
  org_id: string;
  period_key: string;
  currency: string;
  totals: BudgetEnvelopesTotals;
  envelopes: BudgetEnvelopeRow[];
  request_id: string;
};

/** Fetch the budget envelope view: planned vs. actual spending per category for a period. */
export async function getBudgetEnvelopes(periodKey: string): Promise<BudgetEnvelopesResponse> {
  return apiClient(`/v1/finance/budgets/${encodeURIComponent(periodKey)}/envelopes`);
}

/** ─── Recurring Candidates (server-side pattern detection) ──────── */

/** A suggested recurring rule derived from detected transaction patterns. */
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

export type RecurringCandidatesResponse = {
  org_id: string;
  days_back: number;
  candidates: RecurringCandidate[];
  request_id: string;
};

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
  return apiClient(`/v1/finance/recurring/candidates${suffix}`);
}

/** ─── Forecast ─────────────────────────────────────────────────── */

/** One category's average monthly expense in the forecast. */
export type ForecastCategoryRow = {
  category: string;
  expense_monthly_avg: number;
};

export type ForecastResponse = {
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
  request_id: string;
};

/** Fetch a financial forecast: projected income/expense/net for upcoming months. */
export async function getForecast(params?: {
  period_key?: string;
  months?: number;
  top_categories?: number;
}): Promise<ForecastResponse> {
  const search = new URLSearchParams();
  if (params?.period_key) search.set("period_key", params.period_key);
  if (typeof params?.months === "number") search.set("months", String(params.months));
  if (typeof params?.top_categories === "number") search.set("top_categories", String(params.top_categories));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/finance/forecast${suffix}`);
}
