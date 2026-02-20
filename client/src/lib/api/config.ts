import { apiClient } from "./core";

import type {
  AppConfigResponse as SdkAppConfigResponse,
  EntitlementsMeResponse as SdkEntitlementsMeResponse,
  PlanLimit,
  PlansResponse,
} from "@/types/apiTypes";

export type AppConfig = SdkAppConfigResponse;
export type Entitlement = SdkEntitlementsMeResponse;
export type { PlanLimit, PlansResponse };

export async function getMyConfig(): Promise<AppConfig> {
  return apiClient("/config/me");
}

export async function getPlans(): Promise<PlansResponse> {
  return apiClient("/plans");
}

export async function getMyEntitlements(): Promise<Entitlement> {
  return apiClient("/entitlements/me");
}


