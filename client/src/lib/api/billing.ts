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

export interface DunningStateResponse {
  dunning: DunningState;
  request_id?: string;
}

export interface DunningRetryResponse {
  success: boolean;
  recovered: boolean;
  invoice_number?: string;
  message: string;
  dunning_state?: DunningState;
  request_id?: string;
}

/** Create a checkout session for subscribing to a plan. */
export async function createBillingCheckout(payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> {
  return apiClient("/billing/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Get a URL to the customer billing portal for self-service management.
 * `returnUrl` specifies where to redirect after the user exits the portal.
 */
export async function getBillingPortal(returnUrl?: string): Promise<BillingPortalResponse> {
  const query = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
  return apiClient(`/billing/portal${query}`, { method: "GET" });
}

/** Purchase an on-demand credit pack booster. */
export async function purchaseCreditPack(payload: PurchaseCreditsRequest): Promise<PurchaseCreditsResponse> {
  return apiClient("/billing/credits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Fetch invoice receipts history for the current organization with optional currency conversion. */
export async function getBillingInvoices(currency?: string): Promise<{ currency?: string; invoices: BillingInvoice[] }> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return apiClient(`/billing/invoices${query}`, { method: "GET" });
}

/** Fetch current subscription dunning and grace period status. */
export async function getDunningStatus(): Promise<DunningStateResponse> {
  return apiClient("/billing/dunning", { method: "GET" });
}

/** Trigger an immediate payment retry for past-due subscriptions. */
export async function retryDunningPayment(): Promise<DunningRetryResponse> {
  return apiClient("/billing/dunning/retry", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Simulate a payment failure for testing grace period and dunning workflows. */
export async function simulateDunningFailure(reason?: string): Promise<DunningStateResponse & { simulated: boolean }> {
  return apiClient("/billing/dunning/simulate-failure", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

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


