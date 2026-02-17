import { apiClient } from "./core";

export type PlanLimit = {
  monthly_ai_calls: number;
  scenario_depth: number;
  ocr_quota: number;
  export_access: boolean;
};

export type Entitlement = {
  plan: "free" | "pro" | "team";
  status: "active" | "trialing" | "past_due" | "canceled";
  limits: PlanLimit;
  usage: {
    monthly_ai_calls: number;
    scenario_depth: number;
    ocr_quota: number;
    export_access: number;
  };
  remaining: PlanLimit;
  period_key: string;
  request_id?: string;
};

export type AppConfig = {
  features: {
    tasks_enabled: boolean;
    receipts_ocr_enabled: boolean;
    journal_enabled: boolean;
    monetization_enabled: boolean;
    csrf_enabled: boolean;
    google_oauth_enabled: boolean;
  };
  entitlements: null | {
    plan: "free" | "pro" | "team";
    status: string;
    limits: PlanLimit;
    usage: Entitlement["usage"];
    remaining: PlanLimit;
    period_key: string;
  };
  request_id?: string;
};

export async function getMyConfig(): Promise<AppConfig> {
  return apiClient("/config/me");
}

export async function getPlans(): Promise<{ plans: Array<{ id: string; label: string; limits: PlanLimit }>; request_id?: string }> {
  return apiClient("/plans");
}

export async function getMyEntitlements(): Promise<Entitlement> {
  return apiClient("/entitlements/me");
}

