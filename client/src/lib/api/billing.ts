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

import type { BillingCheckoutRequest, BillingCheckoutResponse, BillingPortalResponse } from "@/types/apiTypes";

/** Create a checkout session for subscribing to a plan. */
export async function createBillingCheckout(payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> {
  return apiClient("/v1/billing/checkout", {
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
  return apiClient(`/v1/billing/portal${query}`, { method: "GET" });
}


