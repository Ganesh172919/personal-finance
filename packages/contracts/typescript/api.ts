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
export interface ApiResponseBase {
  request_id?: string;
}

/** Standard error shape returned by all endpoints. */
export interface ApiErrorResponse extends ApiResponseBase {
  message: string;
  code: string;
  details?: unknown;
}

// ─── Auth ────────────────────────────────────────────────

export interface AuthUserResponse extends ApiResponseBase {
  _id: string;
  name: string;
  email: string;
  photoURL?: string | null;
  isVerified?: boolean;
  provider?: string;
}

export interface CsrfResponse extends ApiResponseBase {
  csrf_token: string;
}

export interface LogoutResponse extends ApiResponseBase {
  ok: boolean;
}

export interface AuthProvidersResponse extends ApiResponseBase {
  email: boolean;
  google: boolean;
}

// ─── Transactions ────────────────────────────────────────

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

export interface TransactionListResponse extends ApiResponseBase {
  transactions: TransactionDto[];
  total: number;
  page?: number;
  limit?: number;
}

export interface TransactionSummaryResponse extends ApiResponseBase {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  topCategories: Array<{ category: string; amount: number }>;
}

// ─── Entitlements / Usage ────────────────────────────────

export type PlanTier = "free" | "pro" | "team" | "enterprise";

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

export interface FeatureLimitErrorDetails {
  feature: string;
  limit: number;
  used: number;
  requested_units: number;
}
