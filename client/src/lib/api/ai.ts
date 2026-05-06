/**
 * @fileoverview AI API Client
 *
 * Functions for interacting with the AI subsystem: status monitoring,
 * session management, model catalog, command processing, and scenario analysis.
 *
 * AI CORE vs SERVER AI:
 * - `/ai-core/*` routes proxy to the Python FastAPI AI Core service
 * - `/process-command` and `/scenarios/*` are handled by the Express server
 *
 * SESSION MANAGEMENT:
 * AI sessions are multi-step workflows that can be paused, resumed, and
 * inspected. Each session has checkpoints that record the state at each
 * phase of processing.
 *
 * SCENARIO ANALYSIS:
 * The what-if scenario endpoint evaluates "what if I spent/earned/invested
 * X more per month?" against the user's financial data.
 *
 * @module lib/api/ai
 */

import type {
  AiCoreStatusResponse,
  EnhancedAiStatusResponse,
  ModelListResponse,
  ProcessAICommandResponse,
  SessionDetailResponse,
  SessionListResponse,
} from "@/types/ai.types";

import { apiClient } from "./core";

/** Get basic AI Core health status */
export async function getAiCoreStatus(): Promise<AiCoreStatusResponse> {
  return apiClient("/ai-core/status");
}

/**
 * Get enhanced AI status including key pools, sessions, and model catalog.
 * This calls the AI Core directly via the proxy.
 */
export async function getEnhancedAiStatus(): Promise<EnhancedAiStatusResponse> {
  return apiClient("/ai-core/ai/status");
}

/**
 * List AI sessions for a user.
 */
export async function listAiSessions(
  orgId?: string,
  userId?: string,
  limit = 20
): Promise<SessionListResponse> {
  const params = new URLSearchParams();
  if (orgId) params.set("org_id", orgId);
  if (userId) params.set("user_id", userId);
  params.set("limit", String(limit));
  return apiClient(`/ai-core/ai/sessions?${params.toString()}`);
}

/**
 * Get details of a specific AI session.
 */
export async function getAiSession(sessionId: string): Promise<SessionDetailResponse> {
  return apiClient(`/ai-core/ai/sessions/${sessionId}`);
}

/**
 * Resume a paused or in-progress session.
 */
export async function resumeAiSession(sessionId: string): Promise<SessionDetailResponse> {
  return apiClient(`/ai-core/ai/sessions/${sessionId}/resume`, {
    method: "POST",
  });
}

/**
 * List available AI models from the catalog.
 */
export async function listAiModels(
  provider?: string,
  capability?: string
): Promise<ModelListResponse> {
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  if (capability) params.set("capability", capability);
  const query = params.toString();
  return apiClient(`/ai-core/ai/models${query ? `?${query}` : ""}`);
}

/**
 * Process an AI command (the main AI entry point for non-streaming requests).
 * This is the non-streaming alternative to useAIStream.
 *
 * @param command - Natural language command (e.g., "analyze my spending")
 * @param options.narrative - Request a narrative-style response
 */
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

/** Alias for processAICommand (backward compatibility) */
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
