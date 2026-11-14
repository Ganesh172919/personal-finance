/**
 * @fileoverview AI System Type Definitions
 *
 * TypeScript interfaces for the AI processing system: tool calls, action plans,
 * key pool management, session state, model catalog, and AI status responses.
 *
 * KEY AREAS:
 * - ToolCall: AI agent actions that may require user confirmation (e.g., create transaction)
 * - Plan: Structured action plan with time-bucketed action items
 * - KeyPoolEntry/Stats: LLM API key health monitoring
 * - SessionState/Checkpoint: Multi-step AI workflow state tracking
 * - ModelEntry: LLM model catalog with capabilities and cost info
 *
 * @module types/ai.types
 */

import type { IWorkflowTraceEntry } from "@/types";

// Categorizes the relative urgency or significance of operational items.
// Applies to action items, automated recommendations, and diagnostic alerts.
// Restricts permitted priority values to low, medium, or high urgency levels.
/** Priority level used across action items, tool calls, and insights */
export type Priority = "low" | "medium" | "high";

// Measures the potential financial or operational risk of tool invocations.
// Mirrored directly against standard priority tiers for uniform risk handling.
// Informs confirmation dialog triggers when executing mutating agent commands.
/** Risk level for tool calls (same scale as priority) */
export type ToolCallRisk = Priority;

// Enumerates all supported agent tool invocation action types in the system.
// Covers transaction handling, budget management, workflow runs, and exports.
// Acts as a strict union discriminant for dispatching backend agent tools.
export type ToolName =
  | "transactions.create"
  | "goals.createOrUpdate"
  | "debts.createOrUpdate"
  | "workflows.create"
  | "workflows.enable"
  | "workflows.run"
  | "exports.create"
  | "notifications.sendEmail";

// Defines the contract for an individual tool invocation requested by AI agents.
// Specifies the target tool, structured arguments, risk tier, and confirmation need.
// Provides client-side components the metadata required to render confirmation prompts.
export interface ToolCall {
  id: string;
  title: string;
  description: string;
  tool: ToolName;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: ToolCallRisk;
}

// Captures core quantitative financial health metrics synthesized by AI.
// Tracks net cash flow, savings percentages, debt ratios, and emergency reserves.
// Serves as the numeric foundation for high-level plan summaries and scorecards.
export interface KeyMetrics {
  monthly_net_cash_flow: number | null;
  savings_rate: number | null;
  debt_to_income: number | null;
  emergency_fund_months: number | null;
  total_debt: number | null;
}

// Outlines an actionable recommendation generated as part of a financial plan.
// Details strategic rationale, step-by-step guidance, priority, and anticipated impact.
// Associates concrete next actions with relevant financial categories and deadlines.
export interface ActionItem {
  id?: string;
  kind?: "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic";
  due_days?: number;
  title: string;
  why: string;
  steps: string[];
  priority: Priority;
  expected_impact: string;
}

// Segregates proposed financial action items across discrete forward-looking horizons.
// Organizes immediate 7-day tasks, intermediate 30-day goals, and annual initiatives.
// Enables structured chronological roadmap rendering within client interfaces.
export interface ActionBuckets {
  next_7_days: ActionItem[];
  next_30_days: ActionItem[];
  next_12_months: ActionItem[];
}

// Represents a comprehensive AI-generated personal finance optimization plan.
// Incorporates executive summaries, key metrics, time-bucketed tasks, and warnings.
// Highlights underlying assumptions and data caveats to ensure transparent guidance.
export interface Plan {
  executive_summary: string;
  key_metrics: KeyMetrics;
  actions: ActionBuckets;
  assumptions: string[];
  data_warnings: string[];
}

// Represents the unified payload returned from processing user AI prompt commands.
// Supplies conversational response text, execution plans, tool requests, and traces.
// Delivers supporting evidence snippets, confidence metrics, and agent audit trails.
export interface ProcessAICommandResponse {
  success: boolean;
  response: string;
  plan?: Plan;
  tool_calls?: ToolCall[];
  evidence?: Array<{
    id?: string;
    type?: string;
    label?: string;
    snippet?: string;
    entity_id?: string;
    page_number?: number;
  }>;
  confidence?: {
    score?: number;
    label?: string;
    notes?: string[];
    coverage?: Record<string, unknown>;
  };
  suggested_actions?: Array<{
    title?: string;
    why?: string;
    priority?: Priority;
    entity_id?: string;
  }>;
  linked_entity_ids?: Record<string, string[]>;
  agent_output_id?: string;
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
  session_id?: string;
  session_status?: string;
  workflow_phase?: string;
  active_provider?: string;
  active_model?: string;
  active_key_id?: string;
  fallback_path?: string[];
  recovered_failures?: Array<Record<string, unknown>>;
  recovered_from_checkpoint?: boolean;
}

// Conveys the operational health and candidate model setup for an AI provider.
// Indicates whether credentials and network connectivity are fully initialized.
// Exposes candidate models and failover configuration for status dashboards.
export interface AiCoreProviderStatus {
  name: string;
  display_name: string;
  configured: boolean;
  active: boolean;
  in_failover_chain?: boolean;
  default_model: string;
  model_candidates: string[];
}

// Key Pool Types
// Defines the health lifecycle states for upstream LLM provider API credentials.
// Tracks available keys through healthy, degraded, cooling down, or tripped states.
// Informs dynamic routing mechanisms to bypass faulty or quota-exhausted keys.
export type KeyStatus = "healthy" | "degraded" | "cooldown" | "circuit_open" | "disabled";

// Aggregates granular performance telemetry and error breakdowns for an API key.
// Records successful and failed requests, status code buckets, and cooldowns.
// Provides objective inputs for circuit-breaking and latency-aware key routing.
export interface KeyHealth {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  errors: {
    "429": number;
    "403": number;
    "404": number;
    "5xx": number;
    other: number;
  };
  consecutive_failures: number;
  last_success_at: number | null;
  last_failure_at: number | null;
  cooldown_until: number | null;
  circuit_opened_at: number | null;
}

// Represents a single managed API credential within an AI provider's key pool.
// Contains unique identifiers, masked fingerprints, status tags, and health logs.
// Powers administrative key rotation, health observation, and circuit control.
export interface KeyPoolEntry {
  key_id: string;
  provider: string;
  index: number;
  enabled: boolean;
  key_fingerprint: string;
  status: KeyStatus;
  health: KeyHealth;
}

// Summarizes operational statistics across an entire pool of provider API keys.
// Computes overall success rates, available key counts, and active rotation rules.
// Surfaces aggregated capacity metrics for monitoring high-availability AI pipelines.
export interface KeyPoolStats {
  provider: string;
  total_keys: number;
  healthy_keys: number;
  degraded_keys: number;
  cooldown_keys: number;
  circuit_open_keys: number;
  disabled_keys: number;
  available_keys: number;
  total_requests: number;
  total_success: number;
  overall_success_rate: number;
  rotation_strategy: string;
  keys: KeyPoolEntry[];
}

// Session Types
// Defines the high-level operational lifecycle states of an AI user session.
// Encompasses initial creation, active progress, pauses, completions, or failures.
// Guides frontend session management and interaction states across long-running tasks.
export type SessionStatus = "created" | "in_progress" | "paused" | "completed" | "failed" | "expired";

// Designates distinct functional stages within multi-step AI reasoning workflows.
// Traces pipeline transitions from routing and planning to synthesis and completion.
// Enforces structured state transitions and checkpointing across execution phases.
export type CheckpointPhase = "routing" | "planning" | "research" | "execution" | "verification" | "synthesis" | "complete" | "error";

// Stores short-term and rolling context state maintained across session turns.
// Holds extracted user facts, ongoing conversation summaries, and pending goals.
// Keeps track of referenced artifacts and cumulative token usage across requests.
export interface SessionMemory {
  user_facts: Record<string, unknown>;
  rolling_summary: string;
  recent_decisions: Array<Record<string, unknown>>;
  unresolved_goals: Array<Record<string, unknown>>;
  artifact_refs: string[];
  total_input_tokens: number;
  total_output_tokens: number;
}

// Encapsulates the comprehensive persisted state of an active AI workflow session.
// Associates sessions with organizational users, current phases, and memory caches.
// Tracks checkpoint quantities, execution durations, expiration dates, and error logs.
export interface SessionState {
  id: string;
  org_id: string;
  user_id: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  original_input: string;
  original_profile: Record<string, unknown> | null;
  current_phase: CheckpointPhase;
  memory: SessionMemory;
  checkpoint_count: number;
  total_duration_ms: number;
  last_active_at: string;
  expires_at: string | null;
  error_count: number;
  last_error: string | null;
}

// Captures an immutable snapshot of workflow execution at a specific phase boundary.
// Records state payloads, individual agent outputs, latency, and context summaries.
// Facilitates workflow pause-and-resume capabilities and detailed audit diagnostics.
export interface SessionCheckpoint {
  id: string;
  session_id: string;
  phase: CheckpointPhase;
  created_at: string;
  state_data: Record<string, unknown>;
  agent_outputs: Record<string, unknown>;
  context_summary: string;
  agent_name: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  error: string | null;
}

// Provides high-level session aggregate counts and state distributions.
// Breaks down total tracked sessions by their respective lifecycle status values.
// Supports administrative dashboards monitoring platform-wide AI usage activity.
export interface SessionStats {
  total_sessions: number;
  by_status: Record<SessionStatus, number>;
  total_checkpoints: number;
}

// Model Catalog Types
// Summarizes catalog distribution metrics across registered AI foundation models.
// Breaks down counts by provider, functional capability, pricing tier, and speeds.
// Assesses overall system readiness regarding vision, JSON mode, and reasoning models.
export interface ModelCatalogStats {
  total_models: number;
  enabled_models: number;
  by_provider: Record<string, number>;
  by_capability: Record<string, number>;
  by_cost_tier: Record<string, number>;
  by_speed_tier: Record<string, number>;
  by_reasoning_strength: Record<string, number>;
  vision_models: number;
  free_models: number;
}

// Details specifications, capabilities, and pricing for a foundation LLM model.
// Encompasses context window limits, token generation caps, and modality support.
// Governs dynamic model selection algorithms based on cost, speed, and capabilities.
export interface ModelEntry {
  model_id: string;
  provider: string;
  display_name: string;
  capabilities: string[];
  context_window: number;
  max_output_tokens: number;
  speed_tier: string;
  cost_tier: string;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  supports_json_mode: boolean;
  fallback_rank: number;
  enabled: boolean;
  description: string;
  tags: string[];
  cost_input_per_1k: number;
  cost_output_per_1k: number;
}

// Enhanced AI Status Response (from /api/ai/status)
// Structures the top-level status diagnostic payload returned by the AI subsystem.
// Aggregates key pool states, model catalogs, active route traces, and canary probes.
// Offers administrative observers comprehensive visibility into AI engine telemetry.
export interface EnhancedAiStatusResponse {
  status: string;
  service: string;
  request_id: string;
  provider: {
    active: string;
    display_name: string;
    default_model: string;
    fallback_chain: string[];
  };
  key_pools: Record<string, KeyPoolStats>;
  model_catalog: ModelCatalogStats;
  model_health: Record<string, unknown>;
  sessions: SessionStats | { error: string };
  rate_limiter: Record<string, unknown>;
  llm_usage: Record<string, unknown>;
  last_route: {
    preferred_provider?: string;
    active_provider?: string;
    active_model?: string;
    active_key_id?: string | null;
    provider_candidates?: string[];
    fallback_path?: string[];
    recovered_failures?: Array<Record<string, unknown>>;
    last_latency_ms?: number;
    last_error?: string | null;
  };
  vision: Record<string, unknown>;
  memory: { enabled: boolean };
  canary?: {
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
}

// Session List Response
// Defines the response structure when fetching a paginated collection of AI sessions.
// Returns an array of session states, total count metadata, and aggregate metrics.
// Standardizes session exploration responses across administrative and user consoles.
export interface SessionListResponse {
  success: boolean;
  sessions?: SessionState[];
  count?: number;
  stats?: SessionStats;
  message?: string;
  request_id: string;
}

// Session Detail Response
// Models the detailed response containing full state and checkpoints for a session.
// Supplies the primary session record alongside an ordered array of checkpoint steps.
// Equips UI views with the requisite data to replay multi-step agent decisions.
export interface SessionDetailResponse {
  success: boolean;
  session: SessionState;
  checkpoints: SessionCheckpoint[];
  request_id: string;
}

// Model List Response
// Represents the API response envelope for catalog queries listing available models.
// Delivers the array of supported model configurations, counts, and request traces.
// Informs client selection dropdowns and model configuration administration tables.
export interface ModelListResponse {
  success: boolean;
  models: ModelEntry[];
  count: number;
  request_id: string;
}

// Represents the health and connectivity status of the AI Core microservice.
// Reflects connectivity to the python service, active providers, and client instances.
// Validates end-to-end integration health between the Node backend and Python engine.
export interface AiCoreStatusResponse {
  ai_core: {
    healthy: boolean;
    base_url?: string;
    request_id?: string;
    health?: {
      provider_chain?: string[];
      [key: string]: unknown;
    };
    health_error?: string | null;
    rate_limit_status?: unknown;
    rate_limit_error?: string | null;
    providers?: {
      providers?: AiCoreProviderStatus[];
    };
    providers_error?: string | null;
  };
  server: {
    ai_core_client: unknown;
  };
}
