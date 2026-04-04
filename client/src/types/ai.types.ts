import type { IWorkflowTraceEntry } from "@/types";

export type Priority = "low" | "medium" | "high";

export type ToolCallRisk = Priority;

export type ToolName =
  | "transactions.create"
  | "goals.createOrUpdate"
  | "debts.createOrUpdate"
  | "workflows.create"
  | "workflows.enable"
  | "workflows.run"
  | "exports.create"
  | "notifications.sendEmail";

export interface ToolCall {
  id: string;
  title: string;
  description: string;
  tool: ToolName;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: ToolCallRisk;
}

export interface KeyMetrics {
  monthly_net_cash_flow: number | null;
  savings_rate: number | null;
  debt_to_income: number | null;
  emergency_fund_months: number | null;
  total_debt: number | null;
}

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
  tool_calls?: ToolCall[];
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
export type KeyStatus = "healthy" | "degraded" | "cooldown" | "circuit_open" | "disabled";

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

export interface KeyPoolEntry {
  key_id: string;
  provider: string;
  index: number;
  enabled: boolean;
  key_fingerprint: string;
  status: KeyStatus;
  health: KeyHealth;
}

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
export type SessionStatus = "created" | "in_progress" | "paused" | "completed" | "failed" | "expired";
export type CheckpointPhase = "routing" | "planning" | "research" | "execution" | "verification" | "synthesis" | "complete" | "error";

export interface SessionMemory {
  user_facts: Record<string, unknown>;
  rolling_summary: string;
  recent_decisions: Array<Record<string, unknown>>;
  unresolved_goals: Array<Record<string, unknown>>;
  artifact_refs: string[];
  total_input_tokens: number;
  total_output_tokens: number;
}

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

export interface SessionStats {
  total_sessions: number;
  by_status: Record<SessionStatus, number>;
  total_checkpoints: number;
}

// Model Catalog Types
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
}

// Session List Response
export interface SessionListResponse {
  success: boolean;
  sessions?: SessionState[];
  count?: number;
  stats?: SessionStats;
  message?: string;
  request_id: string;
}

// Session Detail Response
export interface SessionDetailResponse {
  success: boolean;
  session: SessionState;
  checkpoints: SessionCheckpoint[];
  request_id: string;
}

// Model List Response
export interface ModelListResponse {
  success: boolean;
  models: ModelEntry[];
  count: number;
  request_id: string;
}

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
