/**
 * @fileoverview Billing & Subscription API
 *
 * Integrates with the payment provider (e.g., Stripe) to manage
 * subscription checkout sessions and the customer billing portal.
 *
 * Key concepts:
 * - **Checkout Session**: Redirects the user to a hosted payment page
 *   to subscribe to a plan. The server creates a session and returns
 *   a URL the client should navigate to.
 * - **Billing Portal**: A self-service portal where users can update
 *   payment methods, view invoices, or cancel their subscription.
 *   The optional `returnUrl` controls where the user lands after
 *   leaving the portal.
 *
 * Both endpoints delegate to the shared `apiClient` for consistent
 * authentication and org context.
 */

import { apiClient } from "./core";
import { getActiveOrgId } from "@/lib/orgContext";
import { buildApiUrl } from "@/lib/apiBase";

import type {
  BillingCheckoutRequest,
  BillingCheckoutResponse,
  BillingPortalResponse,
  PurchaseCreditsRequest,
  PurchaseCreditsResponse,
} from "@/types/apiTypes";

// Models historical subscription invoice receipts and transaction line items.
// Captures invoice numbers, tier names, currency conversions, taxes, and payment states.
// Supplies the data contract for invoice history tables and financial bookkeeping.
export interface BillingInvoice {
  id: string;
  invoice_number: string;
  plan_tier: "free" | "pro" | "team" | "enterprise";
  billing_cycle: "monthly" | "annual";
  amount_usd: number;
  tax_usd: number;
  total_usd: number;
  currency?: string;
  amount_localized?: number;
  tax_localized?: number;
  total_localized?: number;
  formatted_total?: string;
  status: "paid" | "void" | "refunded";
  payment_method: string;
  period_start: string;
  period_end: string;
  issued_at: string;
}

// Encapsulates subscription dunning recovery state and payment grace periods.
// Tracks failed charge attempts, days remaining in grace, and retry histories.
// Powers warning banners and grace period timers when subscription payments fail.
export interface DunningState {
  in_dunning: boolean;
  status: "active" | "recovered" | "exhausted" | "none";
  current_attempt: number;
  max_attempts: number;
  grace_period_expires_at: string | null;
  grace_period_days_remaining: number;
  next_retry_at: string | null;
  last_failure_reason: string | null;
  retry_history: Array<{
    attempt: number;
    attempted_at: string;
    status: "failed" | "succeeded";
    failure_reason?: string;
    invoice_number?: string;
  }>;
}

// Represents the API response envelope returning organization dunning health status.
// Bundles the active dunning state record alongside server request tracing IDs.
// Guides client components whether to display payment recovery notifications.
export interface DunningStateResponse {
  dunning: DunningState;
  request_id?: string;
}

// Models the outcome of a manual on-demand subscription payment retry attempt.
// Reports whether payment recovered successfully, invoice references, and updated state.
// Powers feedback banners when users attempt immediate invoice settlements.
export interface DunningRetryResponse {
  success: boolean;
  recovered: boolean;
  invoice_number?: string;
  message: string;
  dunning_state?: DunningState;
  request_id?: string;
}

// Initiates a hosted checkout flow for upgrading or renewing account subscriptions.
// Transmits selected plan tiers, billing cycles, seats, and redirect URLs.
// Returns the external provider checkout URL for client browser navigation.
/** Create a checkout session for subscribing to a plan. */
export async function createBillingCheckout(payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> {
  return apiClient("/billing/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Fetches a self-service customer billing portal URL for payment method management.
// Accepts an optional return destination URL for post-management redirection.
// Enables customers to update cards, view receipts, and modify plans directly.
/**
 * Get a URL to the customer billing portal for self-service management.
 * `returnUrl` specifies where to redirect after the user exits the portal.
 */
export async function getBillingPortal(returnUrl?: string): Promise<BillingPortalResponse> {
  const query = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
  return apiClient(`/billing/portal${query}`, { method: "GET" });
}

// Submits an order for specialized usage credit packs like AI tokens or OCR pages.
// Transmits the pack identifier and allocates purchased credits immediately.
// Returns updated credit balances and transaction confirmation metadata.
/** Purchase an on-demand credit pack booster. */
export async function purchaseCreditPack(payload: PurchaseCreditsRequest): Promise<PurchaseCreditsResponse> {
  return apiClient("/billing/credits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Retrieves invoice payment histories for the active tenant organization.
// Supports localized currency formatting options to display regional invoice costs.
// Populates past billing statement tables and receipt download interfaces.
/** Fetch invoice receipts history for the current organization with optional currency conversion. */
export async function getBillingInvoices(currency?: string): Promise<{ currency?: string; invoices: BillingInvoice[] }> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return apiClient(`/billing/invoices${query}`, { method: "GET" });
}

// Queries the active subscription dunning status and payment recovery state.
// Checks whether the account has overdue payments or active grace period protection.
// Determines whether payment failure alerts should be rendered in UI dashboards.
/** Fetch current subscription dunning and grace period status. */
export async function getDunningStatus(): Promise<DunningStateResponse> {
  return apiClient("/billing/dunning", { method: "GET" });
}

// Triggers an immediate retry of a failed subscription charge via payment gateways.
// Bypasses scheduled retry delays when a customer updates their billing card.
// Returns instant recovery feedback to unlock restricted account features.
/** Trigger an immediate payment retry for past-due subscriptions. */
export async function retryDunningPayment(): Promise<DunningRetryResponse> {
  return apiClient("/billing/dunning/retry", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Simulates a subscription charge failure for developer testing and verification.
// Triggers dunning transition logic and grace period countdown timers safely.
// Useful for end-to-end testing of dunning recovery alerts in preview environments.
/** Simulate a payment failure for testing grace period and dunning workflows. */
export async function simulateDunningFailure(reason?: string): Promise<DunningStateResponse & { simulated: boolean }> {
  return apiClient("/billing/dunning/simulate-failure", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Downloads a rendered PDF invoice receipt directly to the user's browser.
// Attaches active organization headers, triggers stream downloads, and revokes URLs.
// Provides users formal receipt documents for accounting and tax records.
/** Download an invoice PDF receipt. */
export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
  const headers = new Headers();
  const activeOrgId = getActiveOrgId();
  if (activeOrgId) headers.set("X-Org-Id", activeOrgId);

  const response = await fetch(buildApiUrl(`/billing/invoices/${invoiceId}/pdf`), {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to download invoice PDF (status ${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice-${invoiceNumber}.pdf`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}


