import type { AiCoreStatusResponse, ProcessAICommandResponse } from "@/types/ai.types";

import { apiClient } from "./core";

export async function getAiCoreStatus(): Promise<AiCoreStatusResponse> {
  return apiClient("/ai-core/status");
}

export async function processAICommand(
  command: string,
  options: { narrative?: boolean } = {}
): Promise<ProcessAICommandResponse> {
  const body: any = { command };
  if (options.narrative !== undefined) {
    body.options = { narrative: options.narrative };
  }

  return apiClient("/process-command", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function processAICommandWithOptions(
  command: string,
  options: { narrative?: boolean } = {}
): Promise<ProcessAICommandResponse> {
  return processAICommand(command, options);
}

export interface ScenarioAssumptionsPayload {
  months?: number;
  expected_return_pct?: number;
  inflation_pct?: number;
}

export interface ScenarioParametersPayload {
  scenario_type: "expense" | "income" | "investment";
  amount: number;
  description?: string;
  assumptions?: ScenarioAssumptionsPayload;
}

export interface ScenarioResponse {
  scenario_type: "expense" | "income" | "investment";
  amount: number;
  baseline: {
    monthly_income: number;
    monthly_expenses: number;
    monthly_surplus: number;
    savings: number;
    total_debt: number;
  };
  delta: {
    monthly_surplus_change: number;
    new_monthly_surplus: number;
    savings_change_horizon: number;
    projected_investment_value: number | null;
    emergency_fund_months_before: number | null;
    emergency_fund_months_after: number | null;
    goal_timeline_delta_months: number;
  };
  assumptions: {
    months: number;
    expected_return_pct: number;
    inflation_pct: number;
  };
  recommendations: string[];
  originalBudget: number;
  newBudget: number;
  savingsImpact: number;
  goalDelay: number;
  adjustments: Array<{ category: string; reduction: number }>;
  request_id?: string;
  fallback_used?: boolean;
  scenario_request?: {
    scenario_type: "expense" | "income" | "investment";
    amount: number;
    assumptions?: ScenarioAssumptionsPayload;
  };
}

export async function processScenario(parameters: ScenarioParametersPayload): Promise<ScenarioResponse> {
  return apiClient("/scenarios/what-if", {
    method: "POST",
    body: JSON.stringify({ parameters }),
  });
}
