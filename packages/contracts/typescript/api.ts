/**
 * Shared contract types for FinWise client ↔ server communication.
 *
 * These types are the "source of truth" for API request/response shapes.
 * Both the client and server should import from here to avoid drift.
 *
 * START WITH: high-traffic DTOs that are most likely to drift.
 */

// ─── Common ──────────────────────────────────────────────

/** Every API response includes a request_id for tracing. */
// Base response contract interface extended by all API endpoints.
// Carries optional distributed request tracking identifiers.
// Facilitates correlation across client requests and backend server logs.
export interface ApiResponseBase {
  request_id?: string;
}

/** Standard error shape returned by all endpoints. */
// Standard error payload contract returned on endpoint failures.
// Defines required error messages, machine-readable codes, and context.
// Extends ApiResponseBase to include tracking identifiers with error traces.
export interface ApiErrorResponse extends ApiResponseBase {
  message: string;
  code: string;
  details?: unknown;
}

// ─── Auth ────────────────────────────────────────────────

// Contract representing authenticated user credentials and profile details.
// Specifies user identifier, full name, email, avatar, and verification state.
// Returned by authentication check and login endpoints across platforms.
export interface AuthUserResponse extends ApiResponseBase {
  _id: string;
  name: string;
  email: string;
  photoURL?: string | null;
  isVerified?: boolean;
  provider?: string;
}

// Security contract carrying cross-site request forgery prevention tokens.
// Injected into sensitive client mutation headers to safeguard requests.
// Returned during authentication handshake to protect stateful endpoints.
export interface CsrfResponse extends ApiResponseBase {
  csrf_token: string;
}

// Contract confirming the invalidation of active client user sessions.
// Returns a boolean success indicator upon terminating session cookies.
// Used by sign-out handlers to trigger local client state cleanup.
export interface LogoutResponse extends ApiResponseBase {
  ok: boolean;
}

// Contract reporting enabled authentication strategies and identity providers.
// Specifies availability toggles for native email and Google OAuth logins.
// Guides client authentication screens in rendering available sign-in options.
export interface AuthProvidersResponse extends ApiResponseBase {
  email: boolean;
  google: boolean;
}

// ─── Transactions ────────────────────────────────────────

// Data transfer object representing a normalized financial transaction.
// Captures transaction amount, categorical assignment, date, and flow type.
// Supports optional merchant, account, and external synchronization links.
export interface TransactionDto {
  _id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: "income" | "expense" | "transfer";
  orgId?: string;
  merchantId?: string;
  accountId?: string;
  externalId?: string;
  tags?: string[];
}

// Contract wrapping paginated lists of historical user financial transactions.
// Encapsulates an array of transaction DTOs alongside total record counts.
// Supplies pagination limit and offset metadata for client data tables.
export interface TransactionListResponse extends ApiResponseBase {
  transactions: TransactionDto[];
  total: number;
  page?: number;
  limit?: number;
}

// Contract summarizing aggregate financial performance across transaction sets.
// Delivers total income, cumulative expenses, net savings, and savings rate.
// Itemizes highest spending categories to power client financial dashboards.
export interface TransactionSummaryResponse extends ApiResponseBase {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  topCategories: Array<{ category: string; amount: number }>;
}

// ─── Entitlements / Usage ────────────────────────────────

// Type alias defining supported organization entitlement subscription tiers.
// Enumerates free, professional, team, and enterprise account tiers.
// Dictates quotas, advanced AI features, and operational concurrency limits.
export type PlanTier = "free" | "pro" | "team" | "enterprise";

// Contract specifying resource consumption ceilings for subscription tiers.
// Restricts monthly AI calls, scenario depths, OCR requests, and workflows.
// Enforced by API middleware gates to prevent over-allocation of resources.
export interface PlanLimits {
  monthly_ai_calls: number;
  scenario_depth: number;
  ocr_quota: number;
  export_access: boolean;
  api_requests: number;
  autopilot_actions: number;
  workflow_runs: number;
  connector_sync_records: number;
  marketplace_installs: number;
}

// Contract delivering active entitlement limits and current usage balances.
// Maps subscription tiers, base quotas, earned credits, and remaining counts.
// Informs frontend feature gates and quota consumption indicator bars.
export interface ResolvedEntitlementsResponse extends ApiResponseBase {
  plan: PlanTier;
  status: string;
  base_limits: PlanLimits;
  credits: Record<string, number>;
  limits: PlanLimits;
  usage: Record<string, number>;
  remaining: Record<string, number | boolean>;
  period_key: string;
}

// ─── Feature Limit Error ─────────────────────────────────

// Detailed metadata contract attached to feature limit exceeded error responses.
// Indicates target feature name, allowed quota limit, and current usage level.
// Enables clients to trigger upgrade modals when users hit tier boundaries.
export interface FeatureLimitErrorDetails {
  feature: string;
  limit: number;
  used: number;
  requested_units: number;
}
