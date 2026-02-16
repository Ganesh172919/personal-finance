import type { IWorkflowTraceEntry } from "@/types";

export type Priority = "low" | "medium" | "high";

export interface KeyMetrics {
  monthly_net_cash_flow: number | null;
  savings_rate: number | null;
  debt_to_income: number | null;
  emergency_fund_months: number | null;
  total_debt: number | null;
}

export interface ActionItem {
  title: string;
  why: string;
  steps: string[];
  priority: Priority;
  expected_impact: string;
}

export interface ActionBuckets {
  next_7_days: ActionItem[];
  next_30_days: ActionItem[];
  next_12_months: ActionItem[];
}

export interface Plan {
  executive_summary: string;
  key_metrics: KeyMetrics;
  actions: ActionBuckets;
  assumptions: string[];
  data_warnings: string[];
}

export interface ProcessAICommandResponse {
  success: boolean;
  response: string;
  plan?: Plan;
  analysis_type?: string;
  agents_involved?: string[];
  actionType?: string;
  priority?: Priority;
  insights?: Array<{
    agent: string;
    title: string;
    description: string;
    actionType: string;
    priority?: Priority;
  }>;
  workflow_trace?: IWorkflowTraceEntry[];
  detailed_analysis?: Record<string, unknown>;
  fallback_used?: boolean;
  llm_call_count?: number;
  request_id?: string;
  cache_hit?: boolean;
}

export interface AiCoreStatusResponse {
  ai_core: {
    healthy: boolean;
    request_id?: string;
    health?: unknown;
    rate_limit_status?: unknown;
  };
  server: {
    ai_core_client: unknown;
  };
}

