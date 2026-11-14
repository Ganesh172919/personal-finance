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
import { idempotencyHeaders } from "../idempotency";

// Fetches high-level operational health indicators from the AI Core microservice.
// Checks whether backend neural network services and providers are available.
// Informs administrative telemetry status widgets across platform health views.
/** Get basic AI Core health status */
export async function getAiCoreStatus(): Promise<AiCoreStatusResponse> {
  return apiClient("/ai-core/status");
}

// Queries comprehensive AI telemetry including key pool states and model catalogs.
// Retrieves deep runtime metrics directly from the proxy gateway interface.
// Powers developer observability dashboards and LLM provider configuration panels.
/**
 * Get enhanced AI status including key pools, sessions, and model catalog.
 * This calls the AI Core directly via the proxy.
 */
export async function getEnhancedAiStatus(): Promise<EnhancedAiStatusResponse> {
  return apiClient("/ai-core/ai/status");
}

// Retrieves a paginated list of AI workflow sessions matching user or org filters.
// Supports administrative oversight and user history exploration across past sessions.
// Returns summary metadata, active status tags, and execution timestamps.
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

// Fetches the detailed state and checkpoint history for a specific AI workflow session.
// Retrieves granular agent outputs, conversational memories, and step latencies.
// Enables step-by-step diagnostic inspection and execution replay inside the client.
/**
 * Get details of a specific AI session.
 */
export async function getAiSession(sessionId: string): Promise<SessionDetailResponse> {
  return apiClient(`/ai-core/ai/sessions/${sessionId}`);
}

// Resumes execution for an in-progress or paused multi-phase AI workflow session.
// Dispatches an asynchronous resume command to pick up from the latest saved checkpoint.
// Returns updated session state records reflecting continued pipeline execution.
/**
 * Resume a paused or in-progress session.
 */
export async function resumeAiSession(sessionId: string): Promise<SessionDetailResponse> {
  return apiClient(`/ai-core/ai/sessions/${sessionId}/resume`, {
    method: "POST",
  });
}

// Fetches the catalog of available foundation language models filtered by attributes.
// Supports provider and capability filters to discover models supporting vision or JSON.
// Feeds dynamic model selection pickers in administrative control panels.
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

// Submits a natural language financial prompt command for non-streaming processing.
// Attaches optional idempotency keys and narrative response formatting parameters.
// Returns complete structured plans, proposed tool calls, and evidence citations.
/**
 * Process an AI command (the main AI entry point for non-streaming requests).
 * This is the non-streaming alternative to useAIStream.
 *
 * @param command - Natural language command (e.g., "analyze my spending")
 * @param options.narrative - Request a narrative-style response
 */
export async function processAICommand(
  command: string,
  options: { narrative?: boolean; idempotencyKey?: string } = {}
): Promise<ProcessAICommandResponse> {
  const body: any = { command };
  if (options.narrative !== undefined) {
    body.options = { narrative: options.narrative };
  }

  return apiClient("/process-command", {
    method: "POST",
    headers: idempotencyHeaders(options.idempotencyKey),
    body: JSON.stringify(body),
  });
}

// Compatibility alias delegating directly to the primary processAICommand function.
// Retained to preserve backward compatibility for legacy callers across the codebase.
// Forwards natural language command text alongside narrative option parameters.
/** Alias for processAICommand (backward compatibility) */
export async function processAICommandWithOptions(
  command: string,
  options: { narrative?: boolean } = {}
): Promise<ProcessAICommandResponse> {
  return processAICommand(command, options);
}

// Models macroeconomic and temporal assumptions applied to financial what-if scans.
// Specifies the projection horizon in months, anticipated returns, and inflation rates.
// Standardizes configurable variables used when simulating future monetary scenarios.
export interface ScenarioAssumptionsPayload {
  months?: number;
  expected_return_pct?: number;
  inflation_pct?: number;
}

// Defines the parameter payload required to simulate an adjusted financial scenario.
// Identifies transaction types, adjustment amounts, descriptions, and assumptions.
// Directs backend projection engines when computing hypothetical future cash flows.
export interface ScenarioParametersPayload {
  scenario_type: "expense" | "income" | "investment";
  amount: number;
  description?: string;
  assumptions?: ScenarioAssumptionsPayload;
}

// Models the quantitative simulation results returned from financial what-if analyses.
// Compares baseline cash flows against projected changes across savings and debt.
// Delivers specific budget adjustments, goal delay estimates, and recommendations.
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

// Dispatches financial scenario parameters to compute comparative what-if projections.
// Evaluates hypothetical income, expense, or investment changes against baseline data.
// Supplies users actionable foresight on how choices impact long-term goal timelines.
export async function processScenario(parameters: ScenarioParametersPayload): Promise<ScenarioResponse> {
  return apiClient("/scenarios/what-if", {
    method: "POST",
    body: JSON.stringify({ parameters }),
  });
}

// Queries the continuous numeric safety canary verification system for recent telemetry.
// Returns pass/fail distributions across financial invariant rules and probe sources.
// Surfaces early warning indicators regarding potential mathematical inaccuracies.
/**
 * Get continuous production canary validation health status.
 */
export async function getCanaryHealth(): Promise<{
  status: string;
  canary: {
    status: "healthy" | "warning" | "critical";
    total_evaluations: number;
    passed_evaluations: number;
    failed_evaluations: number;
    pass_rate_pct: number;
    last_evaluated_at: string | null;
    by_invariant: Record<string, { total: number; passed: number; failed: number; pass_rate_pct: number }>;
    by_source: Record<string, { total: number; passed: number; failed: number; pass_rate_pct: number }>;
    recent_events: Array<{
      probe_id: string;
      timestamp: string;
      invariant: string;
      source: string;
      passed: boolean;
      duration_ms: number;
      details?: Record<string, unknown>;
      violations?: string[];
    }>;
  };
}> {
  return apiClient("/ai/canary/number-safety");
}

// Executes on-demand synthetic invariant probes against the active AI reasoning pipeline.
// Evaluates model precision against predefined mathematical and sanity assertions.
// Delivers a comprehensive test suite execution report detailing passes and violations.
/**
 * Trigger the synthetic canary probe suite on demand and return execution report.
 */
export async function runCanaryProbes(sampleSize?: number): Promise<{
  status: string;
  report: {
    suite_name: string;
    total_probes: number;
    suite_passed: number;
    suite_failed: number;
    suite_pass_rate_pct: number;
    elapsed_ms: number;
    results: Array<{
      probe_id: string;
      invariant: string;
      description?: string;
      expected_pass: boolean;
      actual_invariant_passed: boolean;
      probe_assertion_passed: boolean;
      duration_ms: number;
      violations: string[];
    }>;
    health_summary: any;
  };
}> {
  return apiClient("/ai/canary/run-probes", {
    method: "POST",
    body: JSON.stringify({ sample_size: sampleSize }),
  });
}
