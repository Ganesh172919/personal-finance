/**
 * @fileoverview App Configuration & Entitlements API
 *
 * Provides functions to query the current user's app configuration,
 * available subscription plans, and active entitlements (feature limits
 * and quotas tied to the user's plan).
 *
 * Key concepts:
 * - **AppConfig**: The user's personalised app settings (theme, locale, model
 *   preferences, feature toggles) returned by the `/config/me` endpoint.
 * - **Plans**: A list of all subscription tiers the platform offers, along
 *   with pricing and included feature limits.
 * - **Entitlements**: The effective feature limits and quotas the user can
 *   actually consume right now, derived from their current plan and any
 *   add-ons or overrides.
 *
 * All functions delegate to the shared `apiClient` for consistent
 * authentication, error handling, and organisation context.
 */

import { apiClient } from "./core";

import type {
  AppConfigResponse as SdkAppConfigResponse,
  EntitlementsMeResponse as SdkEntitlementsMeResponse,
  PlanLimit,
  PlansResponse,
} from "@/types/apiTypes";

/* Re-export SDK types under shorter, domain-specific aliases. */
export type AppConfig = SdkAppConfigResponse;
export type Entitlement = SdkEntitlementsMeResponse;
export type { PlanLimit, PlansResponse };

/** Fetch the current user's personalised app configuration. */
export async function getMyConfig(): Promise<AppConfig> {
  return apiClient("/config/me");
}

/** Fetch every subscription plan available on the platform. */
export async function getPlans(): Promise<PlansResponse> {
  return apiClient("/plans");
}

/** Fetch the entitlements (feature limits & quotas) for the current user. */
export async function getMyEntitlements(): Promise<Entitlement> {
  return apiClient("/entitlements/me");
}
