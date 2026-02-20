import { apiClient } from "./core";

import type { BillingCheckoutRequest, BillingCheckoutResponse, BillingPortalResponse } from "@/types/apiTypes";

export async function createBillingCheckout(payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> {
  return apiClient("/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getBillingPortal(returnUrl?: string): Promise<BillingPortalResponse> {
  const query = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
  return apiClient(`/v1/billing/portal${query}`, { method: "GET" });
}


