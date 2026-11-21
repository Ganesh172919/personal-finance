/**
 * @fileoverview AI Core Client Service
 *
 * PURPOSE:
 * This module is the single point of contact between the Node.js backend and the
 * Python-based AI Core microservice. It abstracts away all HTTP communication,
 * error handling, and resilience patterns so that controllers and other services
 * can call AI capabilities without worrying about network failures or timeouts.
 *
 * ARCHITECTURE ROLE:
 * The Node.js server acts as the API gateway and business logic layer, while the
 * Python AI Core service handles all LLM orchestration, multi-agent workflows,
 * and vision/OCR processing. This client bridges the two.
 *
 * KEY PATTERNS:
 * 1. Circuit Breaker -- Prevents cascading failures. When the AI service is down,
 *    the circuit "opens" after a configurable number of consecutive failures and
 *    stays open for a cooldown period. During that time, requests are immediately
 *    short-circuited to a fallback response instead of waiting for a timeout.
 *
 * 2. Health Check Caching -- Avoids hammering the AI service's /health endpoint.
 *    A successful or failed check is cached for a configurable TTL (AI_CORE_HEALTH_CACHE_MS).
 *
 * 3. Concurrency Control -- Delegates to `runWithAiCoreConcurrency` to limit the
 *    number of in-flight AI requests, preventing resource exhaustion on both sides.
 *
 * 4. Fallback Responses -- Every exported function returns a sensible fallback
 *    payload when the AI service is unreachable. This ensures the user always
 *    receives a usable (if generic) response rather than a hard error.
 *
 * 5. Observability -- Every request records duration, endpoint, and whether a
 *    fallback was used via the metrics module, enabling dashboards and alerting.
 *
 * AI OPERATIONS:
 * - processAiCoreRequest: Main conversational AI command processing
 * - streamAiCoreRequest: Server-Sent Events streaming for real-time responses
 * - processAiCoreScenario: What-if financial scenario analysis
 * - processAiCoreReceiptOcr: Receipt image parsing and data extraction
 * - processAiCoreHandwriting: Handwriting recognition from images
 * - processAiCoreGenericOcr: General-purpose text extraction from images
 *
 * CIRCUIT BREAKER STATE MACHINE:
 *   CLOSED (normal) --[failures >= threshold]--> OPEN (reject requests)
 *   OPEN --[timeout expires]--> CLOSED (allow requests again)
 *   CLOSED --[success]--> stays CLOSED, failure counter resets to 0
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * AiCoreClient Service
 * ├── 1. Client Configuration & Lifecycle
 * │   ├── AI_CORE_SERVICE_URL Resolution
 * │   ├── Axios Client Factory with Default Timeouts (30-60s)
 * │   ├── Concurrency Limiter (runWithAiCoreConcurrency)
 * │   └── Health Check Cache (TTL 10-30s)
 * ├── 2. Circuit Breaker Protection
 * │   ├── State: CLOSED | OPEN | HALF_OPEN
 * │   ├── Failure Threshold Counter (consecutive timeouts/5xx)
 * │   ├── Reset Timeout & Cooldown Interval
 * │   └── Immediate Fallback on Circuit Open
 * ├── 3. Execution Operations
 * │   ├── processAiCoreRequest: Orchestrated multi-agent pipeline
 * │   ├── streamAiCoreRequest: SSE real-time stream pipe to client
 * │   ├── processAiCoreScenario: What-if Monte Carlo simulations
 * │   ├── processAiCoreNewsletter: Automated email newsletter content
 * │   └── Vision/OCR: Receipts, Handwriting, General OCR
 * ├── 4. Response Normalization & Grounding
 * │   ├── Grounding Evidence & Citation Passthrough
 * │   ├── Confidence Metric Extraction
 * │   ├── Execution Trace Injection
 * │   └── Plan Model Mapping
 * └── 5. Observability & Telemetry
 *     ├── Prometheus Latency & Fallback Counters
 *     ├── Request ID Tracing Correlation
 *     └── Structured JSON Logging
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               Caller (e.g. aiController / Chat)              |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                   Circuit Breaker Check                       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                         [Is Circuit Closed?]
 *                                /          \
 *                              YES           NO (Circuit OPEN)
 *                              /              \
 *                             v                v
 *   +-------------------------------+   +-----------------------------+
 *   | Acquire Concurrency Slot      |   | Return Deterministic        |
 *   | (runWithAiCoreConcurrency)    |   | Fallback Response           |
 *   +---------------+---------------+   +-----------------------------+
 *                   |
 *                   v
 *   +---------------------------------------------------------------+
 *   |   HTTP POST to Python AI Core (e.g. /api/agents/process)      |
 *   +-------------------------------+-------------------------------+
 *                   |
 *           [HTTP Call Status]
 *               /        \
 *           SUCCESS     FAILURE / TIMEOUT
 *             /            \
 *            v              v
 *   +----------------+   +------------------------------------------+
 *   | Reset Breaker  |   | Increment Failure Counter                |
 *   | Return Result  |   | Trip Circuit if threshold exceeded       |
 *   +----------------+   | Return Deterministic Domain Fallback     |
 *                        +------------------------------------------+
 * ```
 *
 * @module services/aiCoreClient
 */

import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios"; // HTTP client library (chosen for interceptor support and streaming)
import { getEnv, type Env } from "../config/env"; // Typed access to environment variables
import { aiCoreActorHeaders, aiCoreHeaders } from "./aiCoreTransport";
import { primeLearningOptOut } from "./aiLearningOptOut";
import { recordAiCoreRequest, setAiCircuitBreakerState } from "../observability/metrics"; // Prometheus-style metrics for monitoring
import { runWithAiCoreConcurrency, type AiPriority } from "./aiConcurrency"; // Bounded priority-queue admission control
import {
  AiCoreOverloadedError,
  AiCoreUnavailableError,
  CircuitBreaker,
  computeBackoffMs,
  createConnectTimeoutAgents,
  errorStatus,
  isRetryableAiCoreError,
  shedRetryAfterMs,
} from "./aiCoreResilience";
import { createServiceLogger, logEntry, logExit, logSlowOperation } from "../utils/serviceLogger"; // Structured service logging

// Service-scoped logger for AI Core client operations
const svcLog = createServiceLogger("aiCoreClient");

/**
 * Workflow Trace Entry Interface
 *
 * The AI Core service uses a multi-agent architecture where different specialized
 * agents (e.g., budgeting, debt, investment) process parts of a request. Each
 * agent's execution is recorded as a trace entry, enabling:
 * - Debugging which agent failed or was slow
 * - Auditing the reasoning chain
 * - Displaying agent activity in the UI
 */
// Records lifecycle telemetry for specialized sub-agents during an orchestrated AI run.
// Captures execution timestamps, status flags, token counts, and observed latency metrics.
// Enables fine-grained observability, error auditing, and UI step visualization.
export interface WorkflowTraceEntry {
  agent: string; // Agent name (e.g., "budget_agent", "debt_agent")
  startedAt: string; // ISO timestamp when agent started processing
  endedAt: string; // ISO timestamp when agent finished
  status: string; // Execution status (e.g., "completed", "failed", "skipped")
  error?: string; // Error message if the agent encountered a failure
  phase?: string;
  latencyMs?: number;
  llmCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenCount?: number;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
}

/**
 * AI Core Process Request Interface
 *
 * Defines the structure of requests sent to the AI Core service.
 */
// Defines input payload requirements for conversational AI command processing requests.
// Encompasses user prompts, financial profile context, conversation histories, and options.
// Transmitted across HTTP boundaries to the Python multi-agent orchestration service.
export interface AiCoreProcessRequest {
  user_input: string; // User's input command
  user_profile: Record<string, unknown> | null; // User's financial profile
  finance_context?: Record<string, unknown>; // Financial context
  org_id?: string; // Organization ID
  user_id?: string; // User ID
  session_id?: string; // Session ID for conversation tracking
  resume_from_checkpoint?: boolean; // Whether to resume from checkpoint
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>; // Conversation history
  session_summary?: string; // Session summary
  options?: { narrative?: boolean; conversation_mode?: boolean; public_web_search?: boolean; document_draft?: boolean; llm_decomposition?: boolean; include_evidence?: boolean; include_document_passages?: boolean; include_confidence?: boolean; include_actions?: boolean; task_type?: "finance" | "conversation_insights" }; // Processing options
}

/**
 * AI Core Tool Call Interface
 *
 * Represents a tool call that the AI wants to execute.
 */
// Schema for discrete tool actions requested by autonomous agents during command analysis.
// Outlines targeted tool names, structured argument dictionaries, and risk classifications.
// Evaluated by the backend to determine if explicit human confirmation is mandated.
export interface AiCoreToolCall {
  id: string; // Unique tool call ID
  title: string; // Human-readable title
  description: string; // Tool description
  tool: string; // Tool name
  args: Record<string, unknown>; // Tool arguments
  requires_confirmation: boolean; // Whether user confirmation is required
  risk: "low" | "medium" | "high"; // Risk level
}

/**
 * AI Core Process Response Interface
 *
 * Defines the structure of responses from the AI Core service.
 */
// Standard response schema returned from conversational AI Core workflow processing.
// Encompasses narrative advice, recommended financial plans, generated insights, and trace logs.
// Provides complete diagnostic metadata including provider information and token usage tallies.
export interface AiCoreProcessResponse {
  success: boolean; // Whether the request was successful
  conversation_mode?: boolean;
  final_output: string; // Final AI output
  agent: string; // Agent that processed the request
  actionType?: string; // Type of action recommended
  priority?: "low" | "medium" | "high"; // Priority level
  plan?: Record<string, unknown>; // Financial plan
  usage?: {
    tokens_in: number; // Input tokens used
    tokens_out: number; // Output tokens used
    total_tokens?: number; // Total tokens used
    cost_usd?: number; // Cost in USD
    models?: string[]; // Models used
  };
  insights: Array<{
    agent: string; // Agent that generated insight
    title: string; // Insight title
    description: string; // Insight description
    actionType: string; // Recommended action type
    priority?: "low" | "medium" | "high"; // Priority level
  }>;
  analysis_type: string; // Type of analysis performed
  agents_involved: string[]; // Agents involved in processing
  detailed_analysis: Record<string, unknown>; // Detailed analysis data
  workflow_trace: WorkflowTraceEntry[]; // Workflow execution trace
  tool_calls?: AiCoreToolCall[]; // Tool calls to execute
  evidence?: Array<{
    id?: string; // Evidence ID
    type?: string; // Evidence type
    label?: string; // Evidence label
    snippet?: string; // Evidence snippet
    entity_id?: string; // Related entity ID
    page_number?: number; // Verified physical PDF page
  }>;
  confidence?: {
    score?: number; // Confidence score (0-1)
    label?: string; // Confidence label
    notes?: string[]; // Confidence notes
    coverage?: Record<string, unknown>; // Coverage details
  };
  suggested_actions?: Array<{
    title?: string; // Action title
    why?: string; // Reason for action
    priority?: "low" | "medium" | "high"; // Priority level
    entity_id?: string; // Related entity ID
  }>;
  linked_entity_ids?: Record<string, string[]>; // Linked entity IDs
  fallback_used: boolean; // Whether fallback was used
  llm_call_count: number; // Number of LLM calls made
  request_id: string; // Request ID for tracing
  session_id?: string; // Session ID
  session_status?: string; // Session status
  workflow_phase?: string; // Current workflow phase
  active_provider?: string; // Active AI provider
  active_model?: string; // Active AI model
  active_key_id?: string; // Active API key ID
  prompt_version?: string; // Prompt artifact version that produced the output (learning loop)
  routing_version?: string; // Routing config version that routed the request
  cache_hit?: boolean; // Whether an LLM response cache hit served any part of the run
  fallback_path?: string[]; // Fallback path taken
  recovered_failures?: Array<Record<string, unknown>>; // Recovered failures
  recovered_from_checkpoint?: boolean; // Whether recovered from checkpoint
}

/**
 * Circuit Breaker State Variables
 *
 * These are module-level mutable variables that persist across requests within
 * a single Node.js process lifetime. They implement the circuit breaker pattern
 * as a simple state machine without external dependencies.
 *
 * DESIGN DECISION: Using module-scoped variables (not a class) keeps the state
 * global and immediately available without async lookups. This is appropriate
 * because there is exactly one AI Core service endpoint per Node.js process.
 */
// closed/open/half_open breaker (see aiCoreResilience.ts); thresholds are read from env on every use.
const breaker = new CircuitBreaker(
  () => {
    const env = getEnv();
    return {
      failureThreshold: env.AI_CORE_CIRCUIT_FAILURE_THRESHOLD ?? 3,
      openMs: env.AI_CORE_CIRCUIT_OPEN_MS ?? 30_000,
    };
  },
  Date.now,
  (snapshot) =>
    setAiCircuitBreakerState({
      circuitOpen: snapshot.state !== "closed",
      consecutiveFailures: snapshot.consecutiveFailures,
      state: snapshot.state,
    }),
);
let lastHealthCheckAt = 0; // Unix timestamp of last /health poll
let lastHealthHealthy = true; // Cached result of last health check
let lastHealthError: string | null = null; // Error detail for diagnostics

/**
 * HTTP Client Variables
 *
 * Cached HTTP client instance. The singleton is lazily created on first use and
 * recreated if the base URL changes (e.g., during hot-reload or config change).
 * This avoids creating a new TCP connection pool on every request.
 */
let http: AxiosInstance | null = null; // Lazily created Axios instance
let httpBaseUrl = ""; // Tracks the URL to detect config changes
let httpTimeoutMs = 0; // Tracks timeout to detect config changes
let httpInternalToken = "";
let httpConnectTimeoutMs = 0; // Tracks the connect timeout to detect config changes

/**
 * Gets or creates an HTTP client for the AI Core service.
 *
 * This function implements a singleton pattern for the HTTP client:
 * - Creates a new client if none exists or base URL changed
 * - Updates timeout if it changed
 * - Returns cached client otherwise
 *
 * @returns {AxiosInstance} Configured HTTP client
 */
// Lazily instantiates and configures a shared Axios client targeting the AI microservice.
// Reconfigures base URLs, timeouts, and connection agents if environment settings change.
// Returns the persistent HTTP client instance to preserve underlying TCP socket pools.
const getHttpClient = () => {
  const env = getEnv();

  // Create new client if none exists or base URL changed
  const connectTimeoutMs = env.AI_CORE_CONNECT_TIMEOUT_MS ?? 2000;
  if (
    !http ||
    httpBaseUrl !== env.PYTHON_API_URL ||
    httpInternalToken !== (env.AI_CORE_INTERNAL_TOKEN || "") ||
    httpConnectTimeoutMs !== connectTimeoutMs
  ) {
    httpBaseUrl = env.PYTHON_API_URL;
    httpTimeoutMs = env.AI_CORE_TIMEOUT_MS;
    httpInternalToken = env.AI_CORE_INTERNAL_TOKEN || "";
    httpConnectTimeoutMs = connectTimeoutMs;
    http = axios.create({
      baseURL: httpBaseUrl,
      timeout: httpTimeoutMs, // read/response timeout; the TCP connect timeout is enforced by the agents
      headers: aiCoreHeaders({ contentType: "application/json" }),
      ...createConnectTimeoutAgents(connectTimeoutMs),
    });
    return http;
  }

  // Update timeout if it changed
  if (httpTimeoutMs !== env.AI_CORE_TIMEOUT_MS) {
    httpTimeoutMs = env.AI_CORE_TIMEOUT_MS;
    http.defaults.timeout = httpTimeoutMs;
  }

  return http;
};

/**
 * Returns current ISO timestamp.
 *
 * @returns {string} Current timestamp in ISO format
 */
// Helper function returning the current date and time formatted as an ISO-8601 string.
// Provides standardized timestamps for tracing, telemetry, and fallback generation.
// Used across workflow trace builders and response normalizers.
const nowIso = () => new Date().toISOString();

/**
 * Normalizes the AI Core process response.
 *
 * WHY NORMALIZATION MATTERS:
 * The Python AI service may return responses with missing fields, wrong types,
 * or unexpected structures (especially when using different LLM providers).
 * This function guarantees that downstream TypeScript consumers always receive
 * a well-typed, predictable response shape. Every field gets a safe default.
 *
 * @param {any} data - Raw response data from AI Core (untrusted)
 * @param {string} requestId - Request ID for tracing (used as fallback if missing in response)
 * @returns {AiCoreProcessResponse} Fully normalized, type-safe response
 */
// Sanitizes and truncates prompt or routing version identifiers returned from AI Core.
// Trims string whitespace and limits maximum character length to 80 characters.
// Returns undefined if the candidate input is empty or non-string.
const pickVersion = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : undefined;

// Normalizes and sanitizes arbitrary responses returned from the Python AI Core service.
// Applies type safety checks, default value fallbacks, and structure validations to all fields.
// Shields the frontend and calling controllers from missing or malformed AI response data.
const normalizeProcessResponse = (data: any, requestId: string): AiCoreProcessResponse => {
  // Normalize workflow trace -- each entry is independently validated
  const workflowTrace = Array.isArray(data?.workflow_trace)
    ? data.workflow_trace.map((entry: any) => ({
        agent: String(entry?.agent || "unknown"),
        startedAt: String(entry?.startedAt || nowIso()),
        endedAt: String(entry?.endedAt || nowIso()),
        status: String(entry?.status || "unknown"),
        error: entry?.error ? String(entry.error) : undefined,
        phase: entry?.phase ? String(entry.phase) : undefined,
        ...Object.fromEntries(["latencyMs", "llmCalls", "inputTokens", "outputTokens", "tokenCount"].map((key) => [
          key, Number.isFinite(Number(entry?.[key])) ? Math.max(0, Number(entry[key])) : 0,
        ])),
        fallbackUsed: entry?.fallbackUsed === true,
        cacheHit: entry?.cacheHit === true,
      }))
    : [];

  // Normalize insights
  const insights = Array.isArray(data?.insights)
    ? data.insights
        .filter((insight: any) => insight && typeof insight === "object")
        .map((insight: any) => ({
          agent: String(insight.agent || "unknown"),
          title: String(insight.title || "Insight"),
          description: String(insight.description || ""),
          actionType: String(insight.actionType || "review"),
          priority: ["low", "medium", "high"].includes(String(insight.priority))
            ? (insight.priority as "low" | "medium" | "high")
            : undefined,
        }))
    : [];

  // Normalize usage data
  const readCount = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const usageRaw = data?.usage;
  const inputTokens = readCount(usageRaw?.tokens_in);
  const outputTokens = readCount(usageRaw?.tokens_out);
  const totalTokens = readCount(usageRaw?.total_tokens);
  const validCost = typeof usageRaw?.cost_usd === "number" && Number.isFinite(usageRaw.cost_usd) && usageRaw.cost_usd >= 0;
  const usage =
    inputTokens != null && outputTokens != null && Number.isSafeInteger(inputTokens + outputTokens)
      ? {
          tokens_in: inputTokens,
          tokens_out: outputTokens,
          total_tokens: Math.max(totalTokens ?? 0, inputTokens + outputTokens),
          cost_usd: validCost ? usageRaw.cost_usd : undefined,
          models: Array.isArray(usageRaw.models)
            ? usageRaw.models.filter((model: unknown): model is string => typeof model === "string")
            : undefined,
        }
      : undefined;

  // Normalize tool calls
  const toolCallsRaw = Array.isArray(data?.tool_calls) ? data.tool_calls : [];
  const tool_calls: AiCoreToolCall[] = toolCallsRaw
    .filter((entry: any) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id: String(entry.id || ""),
      title: String(entry.title || "Action"),
      description: String(entry.description || ""),
      tool: String(entry.tool || ""),
      args: entry.args && typeof entry.args === "object" && !Array.isArray(entry.args) ? (entry.args as Record<string, unknown>) : {},
      requires_confirmation: Boolean(entry.requires_confirmation),
      risk: ["low", "medium", "high"].includes(String(entry.risk)) ? (entry.risk as "low" | "medium" | "high") : "low",
    }))
    .filter((entry: AiCoreToolCall) => Boolean(entry.id && entry.tool));

  // Normalize evidence
  const evidence = Array.isArray(data?.evidence)
    ? data.evidence
        .filter((entry: any) => entry && typeof entry === "object")
        .map((entry: any) => ({
          id: entry.id ? String(entry.id) : undefined,
          type: entry.type ? String(entry.type) : undefined,
          label: entry.label ? String(entry.label) : undefined,
          snippet: entry.snippet ? String(entry.snippet) : undefined,
          entity_id: entry.entity_id ? String(entry.entity_id) : undefined,
          ...(typeof entry.page_number === "number" && Number.isSafeInteger(entry.page_number) && entry.page_number > 0
            ? { page_number: entry.page_number } : {}),
        }))
    : undefined;

  // Normalize confidence
  const confidence =
    data?.confidence && typeof data.confidence === "object" && !Array.isArray(data.confidence)
      ? {
          score: Number.isFinite(Number((data.confidence as any).score))
            ? Number((data.confidence as any).score)
            : undefined,
          label: (data.confidence as any).label ? String((data.confidence as any).label) : undefined,
          notes: Array.isArray((data.confidence as any).notes)
            ? (data.confidence as any).notes.map((note: unknown) => String(note))
            : undefined,
          coverage:
            (data.confidence as any).coverage &&
            typeof (data.confidence as any).coverage === "object" &&
            !Array.isArray((data.confidence as any).coverage)
              ? ((data.confidence as any).coverage as Record<string, unknown>)
              : undefined,
        }
      : undefined;

  // Normalize suggested actions
  const suggested_actions = Array.isArray(data?.suggested_actions)
    ? data.suggested_actions
        .filter((entry: any) => entry && typeof entry === "object")
        .map((entry: any) => ({
          title: entry.title ? String(entry.title) : undefined,
          why: entry.why ? String(entry.why) : undefined,
          priority: ["low", "medium", "high"].includes(String(entry.priority))
            ? (entry.priority as "low" | "medium" | "high")
            : undefined,
          entity_id: entry.entity_id ? String(entry.entity_id) : undefined,
        }))
    : undefined;

  // Return normalized response
  return {
    success: data?.success !== false,
    conversation_mode: data?.conversation_mode === true,
    final_output: String(data?.final_output || data?.response || ""),
    agent: String(data?.agent || "master"),
    actionType: data?.actionType ? String(data.actionType) : undefined,
    priority: ["low", "medium", "high"].includes(String(data?.priority))
      ? (data.priority as "low" | "medium" | "high")
      : "medium",
    plan: data?.plan && typeof data.plan === "object" && !Array.isArray(data.plan) ? (data.plan as Record<string, unknown>) : undefined,
    usage,
    insights,
    analysis_type: String(data?.analysis_type || "comprehensive"),
    agents_involved: Array.isArray(data?.agents_involved)
      ? data.agents_involved.map((agent: unknown) => String(agent))
      : [String(data?.agent || "master")],
    detailed_analysis:
      data?.detailed_analysis && typeof data.detailed_analysis === "object"
        ? data.detailed_analysis
        : {},
    workflow_trace: workflowTrace,
    tool_calls,
    evidence,
    confidence,
    suggested_actions,
    linked_entity_ids:
      data?.linked_entity_ids && typeof data.linked_entity_ids === "object" && !Array.isArray(data.linked_entity_ids)
        ? (data.linked_entity_ids as Record<string, string[]>)
        : undefined,
    fallback_used: Boolean(data?.fallback_used),
    llm_call_count: Number.isFinite(Number(data?.llm_call_count)) ? Number(data.llm_call_count) : 0,
    request_id: String(data?.request_id || requestId),
    session_id: data?.session_id ? String(data.session_id) : undefined,
    session_status: data?.session_status ? String(data.session_status) : undefined,
    workflow_phase: data?.workflow_phase ? String(data.workflow_phase) : undefined,
    active_provider: data?.active_provider ? String(data.active_provider) : undefined,
    active_model: data?.active_model ? String(data.active_model) : undefined,
    active_key_id: data?.active_key_id ? String(data.active_key_id) : undefined,
    prompt_version: pickVersion(data?.prompt_version ?? data?.promptVersion ?? data?.artifact_versions?.prompt),
    routing_version: pickVersion(data?.routing_version ?? data?.routingVersion ?? data?.artifact_versions?.routing),
    cache_hit: typeof data?.cache_hit === "boolean" ? data.cache_hit : workflowTrace.some((entry: any) => entry.cacheHit === true) || undefined,
    fallback_path: Array.isArray(data?.fallback_path) ? data.fallback_path.map((item: unknown) => String(item)) : undefined,
    recovered_failures: Array.isArray(data?.recovered_failures) ? data.recovered_failures : undefined,
    recovered_from_checkpoint: Boolean(data?.recovered_from_checkpoint),
  };
};

/**
 * Builds a fallback response when AI Core is unavailable.
 *
 * DESIGN PHILOSOPHY:
 * Rather than returning an error to the user, this function returns generic but
 * sound financial advice. This degrades gracefully -- the user still gets value
 * from the app even when the AI service is completely down. The fallback_used
 * flag lets the frontend display a "using cached advice" indicator.
 *
 * SECURITY NOTE: In production, the detailed reason is NOT included in the
 * user-facing output (only in the response metadata for logging). In non-prod
 * environments, the reason IS included to help developers debug issues.
 *
 * @param {string} requestId - Request ID for tracing and log correlation
 * @param {string} reason - Technical reason for the fallback (for logging)
 * @param {object} [options] - Options for fallback response
 * @param {boolean} [options.includeReasonInOutput] - Whether to include reason in user-facing output
 * @returns {AiCoreProcessResponse} A complete, valid fallback response
 */
// Constructs a deterministic, safe financial advice response when the AI service fails.
// Provides sound baseline financial heuristics, mock plans, and empty token usages.
// Prevents application downtime by ensuring callers always receive a structured response.
const buildFallbackResponse = (
  requestId: string,
  reason: string,
  options: { includeReasonInOutput?: boolean } = {}
): AiCoreProcessResponse => {
  const timestamp = nowIso();
  const includeReasonInOutput = Boolean(options.includeReasonInOutput);
  const trimmedReason = String(reason || "").trim();
  const reasonSnippet =
    includeReasonInOutput && trimmedReason.length > 0
      ? ` (${trimmedReason.length > 180 ? `${trimmedReason.slice(0, 177)}...` : trimmedReason})`
      : "";

  return {
    success: true,
    final_output:
      `AI analysis is temporarily unavailable${reasonSnippet}. Safe fallback: keep monthly cash flow positive, ` +
      "protect emergency savings, prioritize high-interest debt, and invest consistently in diversified assets.",
    agent: "master",
    actionType: "review",
    priority: "medium",
    plan: {
      executive_summary:
        "AI analysis is temporarily unavailable. Use a safe fallback plan focused on cash flow, emergency savings, debt, and consistent investing.",
      key_metrics: {
        monthly_net_cash_flow: null,
        savings_rate: null,
        debt_to_income: null,
        emergency_fund_months: null,
        total_debt: null,
      },
      actions: { next_7_days: [], next_30_days: [], next_12_months: [] },
      assumptions: [],
      data_warnings: [reason],
    },
    usage: {
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      models: [],
    },
    insights: [],
    analysis_type: "comprehensive",
    agents_involved: ["master"],
    detailed_analysis: { fallback_reason: reason },
    workflow_trace: [
      {
        agent: "ai_core_client",
        startedAt: timestamp,
        endedAt: timestamp,
        status: "fallback",
        error: reason,
      },
    ],
    tool_calls: [],
    fallback_used: true,
    llm_call_count: 0,
    request_id: requestId,
  };
};

/**
 * Extracts a human-readable error reason from an Axios error.
 *
 * PRIORITY ORDER:
 * 1. response.data.detail -- FastAPI convention for error detail
 * 2. response.data.message -- Alternative error format
 * 3. error.message -- Axios-level error (e.g., timeout, connection refused)
 * 4. Fallback string -- Last resort for truly unknown errors
 *
 * @param {unknown} error - Error object (may be AxiosError, Error, or anything)
 * @returns {string} Human-readable error reason
 */
// Parses Axios errors or HTTP response bodies to extract a concise human-readable error.
// Prioritizes FastAPI detail properties, followed by generic message fields and error strings.
// Provides clean error descriptions for logging and diagnostic troubleshooting.
const extractErrorReason = (error: unknown) => {
  const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
  // FastAPI uses "detail" field for error messages
  if (axiosError.response?.data?.detail) {
    return String(axiosError.response.data.detail);
  }
  if (axiosError.response?.data?.message) {
    return String(axiosError.response.data.message);
  }
  if (axiosError.message) {
    return axiosError.message;
  }
  return "Unknown AI core error";
};

/**
 * Gate: true when the breaker refuses this request. In half_open this claims the single probe, so
 * every caller reports back through markSuccess / markFailure (never call it for display; use
 * `breaker.snapshot()`).
 */
// Determines whether the AI Core circuit breaker is open and refusing outbound requests.
// Checks circuit breaker state and tracks single-probe requests during half-open recovery.
// Returns true if requests should be immediately aborted or routed to fallback paths.
const isCircuitOpen = () => !breaker.allowRequest();

/** Marks a successful request (closes the breaker). */
// Informs the circuit breaker of a successful request to AI Core.
// Closes the circuit if half-open and resets consecutive failure counters to zero.
// Maintains breaker metrics for monitoring systems and operational dashboards.
const markSuccess = () => {
  breaker.onSuccess();
};

/**
 * Marks a failed request.
 *
 * - 4xx (except 408/429): AI Core is up and rejected that one payload, so the shared breaker is
 *   not tripped for every user.
 * - AiCoreOverloadedError (AI Core shed with 503 + Retry-After): alive but busy, also neutral.
 */
// Records an execution failure against the circuit breaker state tracker.
// Ignores expected client rejection codes (such as validation 4xx) and overload sheds.
// Trips the circuit open once consecutive backend infrastructure failures exceed threshold.
const markFailure = (_env: Env, error?: unknown) => {
  const status = errorStatus(error);
  const rejectedPayload = typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
  if (rejectedPayload || error instanceof AiCoreOverloadedError) {
    breaker.onNeutral();
    return;
  }
  breaker.onFailure();
};

/** Overload (AI Core shed twice) must reach the client as 503 + Retry-After, not as a fallback payload. */
// Re-throws overload exceptions directly rather than suppressing them into fallbacks.
// Ensures that 503 Retry-After signals from AI Core propagate back to the client.
// Prevents masking genuine service capacity limits with misleading static advice.
const rethrowIfOverloaded = (error: unknown) => {
  if (error instanceof AiCoreOverloadedError) throw error;
};

// Pauses execution for a specified duration while respecting AbortSignal cancellations.
// Uses setTimeout unref semantics to prevent blocking Node.js event loop shutdown.
// Facilitates backoff delays during retry sequences and rate-limiting wait times.
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/** POSTs that mutate AI Core state or spend LLM budget are never retried on transient errors. */
const NON_IDEMPOTENT_PATHS = new Set(["/api/agents/process", "/api/agents/process/stream"]);
// Assesses whether an outbound HTTP operation can safely be re-attempted upon failure.
// Categorizes GET requests and specific non-mutating POST endpoints as idempotent.
// Protects state-mutating and LLM budget-draining endpoints from double execution.
const isIdempotentCall = (method: "get" | "post", url: string) =>
  method === "get" || (!NON_IDEMPOTENT_PATHS.has(url) && !/\/resume$/.test(url));

/**
 * Sends one request to AI Core with the gateway's resilience policy:
 * - AI Core 503 + Retry-After means it shed the request before doing work. Wait out the hint
 *   (capped by AI_CORE_RETRY_AFTER_MAX_MS) and retry once, for any call. If it sheds again the
 *   call fails with {@link AiCoreOverloadedError} (503 + Retry-After for the client).
 * - Idempotent calls additionally retry transient errors (connect failures, 408/502/503/504)
 *   up to AI_CORE_RETRY_MAX times with jittered exponential backoff. Read timeouts and
 *   non-idempotent calls are never retried.
 * Breaker accounting is left to the caller, once per logical call.
 */
// Dispatches an HTTP call to the AI Core microservice wrapped with resilience policies.
// Handles Retry-After headers, exponential backoff retries, and circuit breaker telemetry.
// Serves as the robust communication gateway for all AI service operations.
export const callAiCore = async (
  method: "get" | "post",
  url: string,
  data: unknown,
  config: AxiosRequestConfig | undefined,
  idempotent: boolean = isIdempotentCall(method, url),
) => {
  const env = getEnv();
  const client = getHttpClient();
  const maxRetries = idempotent ? (env.AI_CORE_RETRY_MAX ?? 1) : 0;
  const baseMs = env.AI_CORE_RETRY_BASE_MS ?? 200;
  const capMs = env.AI_CORE_RETRY_AFTER_MAX_MS ?? 5000;
  const signal = config?.signal as AbortSignal | undefined;
  let retries = 0;
  let shedRetried = false;

  for (;;) {
    try {
      return method === "get" ? await client.get(url, config) : await client.post(url, data, config);
    } catch (error) {
      if (signal?.aborted) throw error;

      const shedMs = shedRetryAfterMs(error);
      if (shedMs !== undefined) {
        if (shedRetried) throw new AiCoreOverloadedError(shedMs / 1000);
        shedRetried = true;
        svcLog.warn({ url, retry_after_ms: shedMs }, "AI Core shed the request; retrying once after Retry-After");
        await sleep(Math.min(shedMs, capMs), signal);
        continue;
      }

      if (retries < maxRetries && isRetryableAiCoreError(error)) {
        retries += 1;
        const delay = computeBackoffMs(retries, baseMs);
        svcLog.warn({ url, attempt: retries, delay_ms: delay, status: errorStatus(error) }, "AI Core call failed; retrying idempotent request");
        await sleep(delay, signal);
        continue;
      }
      throw error;
    }
  }
};

/** Drop-in for the axios instance that routes post/get through {@link callAiCore}. */
// Factory providing a resilient HTTP client interface routing requests through callAiCore.
// Emulates Axios get and post methods while applying retry and backoff semantics.
// Used by AI Core service methods to execute fault-tolerant remote procedure calls.
const getResilientClient = () => ({
  post: (url: string, data?: unknown, config?: AxiosRequestConfig) => callAiCore("post", url, data, config),
  get: (url: string, config?: AxiosRequestConfig) => callAiCore("get", url, undefined, config),
});

/**
 * Checks AI Core service health.
 *
 * This function performs a health check with caching:
 * - Returns cached result if recent check exists
 * - Makes HTTP request to /health endpoint
 * - Updates health status and error message
 *
 * @param {Env} env - Environment configuration
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<boolean>} True if service is healthy
 */
// Polls the AI Core /health endpoint to verify microservice availability and latency.
// Caches health status for a configurable duration to minimize network query overhead.
// Returns true if the service responds affirmatively within the configured timeout window.
const checkAiCoreHealth = async (env: Env, requestId: string): Promise<boolean> => {
  const now = Date.now();

  // Return cached result if recent check exists
  if (now - lastHealthCheckAt < env.AI_CORE_HEALTH_CACHE_MS) {
    return lastHealthHealthy;
  }

  lastHealthCheckAt = now;

  try {
    const http = getHttpClient();
    await http.get("/health", {
      timeout: env.AI_CORE_HEALTH_TIMEOUT_MS,
      headers: {
        "X-Request-Id": requestId,
      },
    });
    lastHealthHealthy = true;
    lastHealthError = null;
    return true;
  } catch (error) {
    lastHealthHealthy = false;
    lastHealthError = extractErrorReason(error);
    return false;
  }
};

/**
 * Processes a conversational AI request through the AI Core service.
 *
 * FLOW:
 * 1. Acquire a concurrency slot (prevents overwhelming the AI service)
 * 2. Check circuit breaker -- if open, return fallback immediately
 * 3. Check service health for requests that use the heuristic fallback
 * 4. POST to /api/agents/process -- the main AI orchestration endpoint
 * 5. On success: normalize response and return
 * 6. On failure: mark failure, extract error reason, return fallback
 *
 * @param {AiCoreProcessRequest} payload - The AI request payload
 * @param {string} requestId - Unique request ID for distributed tracing
 * @param {object} [options] - Optional configuration
 * @param {string} [options.userId] - User ID for concurrency tracking
 * @returns {Promise<AiCoreProcessResponse>} Normalized AI response or fallback
 */
// Executes a multi-agent conversational AI workflow through the AI Core pipeline.
// Acquires concurrency permits, checks health status, and posts payload to Python backend.
// Returns a normalized, strongly typed response or a safe heuristic fallback upon error.
export const processAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string; priority?: AiPriority }
): Promise<AiCoreProcessResponse> => {
  const startedAt = Date.now();
  const logCtx = { requestId, userId: options?.userId, endpoint: "process" };
  logEntry(svcLog, "processAiCoreRequest", logCtx);

  // runWithAiCoreConcurrency acts as a semaphore, limiting concurrent AI requests
  // per user to prevent a single user from exhausting shared AI resources
  return runWithAiCoreConcurrency({
    userId: options?.userId,
    priority: options?.priority,
    task: async () => {
      const env = getEnv();
        const fallback = (reason: string) => {
          if (payload.options?.conversation_mode) throw new AiCoreUnavailableError(5);
          return buildFallbackResponse(requestId, reason, { includeReasonInOutput: env.NODE_ENV !== "production" });
        };

      // STEP 1: Circuit breaker check -- fastest possible rejection path
      if (isCircuitOpen()) {
        const durationMs = Date.now() - startedAt;
        svcLog.warn({ ...logCtx, reason: "circuit_open", duration_ms: durationMs }, "AI Core request rejected: circuit breaker open");
        recordAiCoreRequest({ endpoint: "process", durationMs, fallbackUsed: true });
        return fallback("AI core circuit breaker open");
      }

      // The chat POST already uses a circuit breaker, a timeout and overloaded responses.
      // A separate preflight can reject a healthy chat worker before it sees the request.
      if (!payload.options?.conversation_mode && !(await checkAiCoreHealth(env, requestId))) {
        markFailure(env);
        const durationMs = Date.now() - startedAt;
        svcLog.warn({ ...logCtx, reason: "health_check_failed", lastHealthError, duration_ms: durationMs }, "AI Core request failed: health check");
        recordAiCoreRequest({ endpoint: "process", durationMs, fallbackUsed: true });
        const detail = lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed";
        // In development, include a helpful hint about starting the AI service
        const hint =
          env.NODE_ENV !== "production"
            ? ` (Is AI Core running at ${env.PYTHON_API_URL}? Start it with uvicorn on port 8001.)`
            : "";
        return fallback(`${detail}${hint}`);
      }

      try {
        // STEP 3: Make the actual AI request
        const http = getResilientClient();
        const learningOptedOut = await primeLearningOptOut(payload?.org_id, { forceRefresh: true, failClosed: true });
        const { data } = await http.post("/api/agents/process", payload, {
          headers: {
            "X-Request-Id": requestId, // Propagated for distributed tracing
            ...aiCoreActorHeaders(payload, { learningOptedOut }), // Tenant actor, authoritative in AI Core
          },
        });

        // Success resets the circuit breaker failure counter
        markSuccess();
        const durationMs = Date.now() - startedAt;
        const response = normalizeProcessResponse(data, requestId);
          if (payload.options?.conversation_mode && (!isConversationalResponseUsable(response) ||
            (payload.options.public_web_search && response.analysis_type !== "public_web_research"))) {
          recordAiCoreRequest({ endpoint: "process", durationMs, fallbackUsed: true });
          svcLog.warn({ ...logCtx, acknowledged: response.conversation_mode, analysisType: response.analysis_type,
            fallback: response.fallback_used, duration_ms: durationMs }, "AI Core did not provide a usable conversational response");
          throw new AiCoreUnavailableError(5);
        }
        recordAiCoreRequest({ endpoint: "process", durationMs, fallbackUsed: false });
        logExit(svcLog, "processAiCoreRequest", { ...logCtx, agent: data?.agent, fallback_used: false }, durationMs);
        logSlowOperation(svcLog, "processAiCoreRequest", durationMs, 10_000);
        // NOTE: Usage tracking (tokens, cost) happens in the background.
        // We intentionally don't await it to minimize response latency.
        return response;
      } catch (error) {
        if (error instanceof AiCoreUnavailableError) throw error;
        // STEP 4: On failure, record the error and return a safe fallback
        markFailure(env, error);
        rethrowIfOverloaded(error);
        const durationMs = Date.now() - startedAt;
        recordAiCoreRequest({ endpoint: "process", durationMs, fallbackUsed: true });
        const detail = extractErrorReason(error);
        svcLog.error({ ...logCtx, error: detail, duration_ms: durationMs, fallback_used: true }, "AI Core request failed");
        const hint = env.NODE_ENV !== "production" ? ` (AI Core base URL: ${env.PYTHON_API_URL})` : "";
        return fallback(`${detail}${hint}`);
      }
    },
  });
};

export function isConversationalResponseUsable(response: Record<string, unknown> | AiCoreProcessResponse): boolean {
  const isFailedAnswer = response.fallback_used === true && (
    response.analysis_type === "chat_assistant" || response.analysis_type === "financial_education" || response.analysis_type === "public_web_research" || response.analysis_type === "document_draft" ||
    response.session_status === "failed" || response.workflow_phase === "error"
  );
  return response.conversation_mode === true && response.success === true &&
    typeof response.final_output === "string" && Boolean(response.final_output.trim()) && !isFailedAnswer;
}

/**
 * Streams an AI request via Server-Sent Events (SSE).
 *
 * KEY DIFFERENCE FROM processAiCoreRequest:
 * Instead of returning a fallback response on error, this function THROWS.
 * The controller layer is responsible for catching the error and formatting
 * an SSE-compatible fallback message. This is because SSE responses require
 * a specific event format that cannot be constructed at this abstraction layer.
 *
 * The responseType: "stream" tells Axios to return the raw Node.js Readable
 * stream instead of buffering the entire response.
 *
 * @param {AiCoreProcessRequest} payload - The AI request payload
 * @param {string} requestId - Unique request ID for distributed tracing
 * @param {object} [options] - Optional configuration
 * @param {string} [options.userId] - User ID for concurrency tracking
 * @returns {Promise<any>} A Node.js Readable stream of SSE events
 * @throws {Error} If circuit breaker is open, health check fails, or request fails
 */
// Streams an AI response over Server-Sent Events for real-time frontend token rendering.
// Bypasses JSON buffering and returns a live Node.js Readable stream directly from AI Core.
// Throws errors immediately upon failure so streaming endpoints can emit error events.
export const streamAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string; signal?: AbortSignal }
): Promise<any> => {
  const startedAt = Date.now();
  const logCtx = { requestId, userId: options?.userId, endpoint: "process_stream" };
  logEntry(svcLog, "streamAiCoreRequest", logCtx);

  const env = getEnv();

  // For streaming, we throw errors instead of returning a fallback block.
  // The controller (SSE endpoint) is responsible for catching these and
  // sending an appropriate error event to the client.
  if (isCircuitOpen()) {
    const durationMs = Date.now() - startedAt;
    svcLog.warn({ ...logCtx, reason: "circuit_open", duration_ms: durationMs }, "AI Core stream rejected: circuit breaker open");
    recordAiCoreRequest({ endpoint: "process_stream", durationMs, fallbackUsed: true });
    throw new Error("AI core circuit breaker open");
  }

  if (!payload.options?.conversation_mode && !(await checkAiCoreHealth(env, requestId))) {
    markFailure(env);
    const durationMs = Date.now() - startedAt;
    svcLog.warn({ ...logCtx, reason: "health_check_failed", duration_ms: durationMs }, "AI Core stream failed: health check");
    recordAiCoreRequest({ endpoint: "process_stream", durationMs, fallbackUsed: true });
    const detail = lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed";
    throw new Error(detail);
  }

  try {
    const http = getResilientClient();
    const learningOptedOut = await primeLearningOptOut(payload?.org_id, { forceRefresh: true, failClosed: true });
    // Return the raw stream object -- the controller will pipe it to the SSE response
    const response = await http.post("/api/agents/process/stream", payload, {
      headers: {
        "X-Request-Id": requestId,
        ...aiCoreActorHeaders(payload, { learningOptedOut }),
        Accept: "text/event-stream", // Tells the AI service to return SSE format
      },
      responseType: "stream", // Tells Axios not to buffer the response
      signal: options?.signal, // Lets the caller cancel upstream work when the client disconnects
    });

    markSuccess();
    const durationMs = Date.now() - startedAt;
    recordAiCoreRequest({ endpoint: "process_stream", durationMs, fallbackUsed: false });
    logExit(svcLog, "streamAiCoreRequest", { ...logCtx, fallback_used: false }, durationMs);
    return response.data; // This is a Readable stream
  } catch (error) {
    // A caller-initiated cancel (client went away) says nothing about AI Core's
    // health, so it must not count toward the circuit breaker.
    if (options?.signal?.aborted || axios.isCancel(error)) {
      svcLog.info({ ...logCtx, reason: "client_aborted" }, "AI Core stream cancelled by caller");
      throw new Error("AI stream cancelled");
    }
    markFailure(env, error);
        rethrowIfOverloaded(error);
    const durationMs = Date.now() - startedAt;
    recordAiCoreRequest({ endpoint: "process_stream", durationMs, fallbackUsed: true });
    svcLog.error({ ...logCtx, error: extractErrorReason(error), duration_ms: durationMs }, "AI Core stream failed");
    throw new Error(extractErrorReason(error));
  }
};

/**
 * Processes a "what-if" financial scenario analysis.
 *
 * WHAT-IF SCENARIOS let users explore hypothetical financial changes:
 * "What if I get a $500/month raise?" or "What if I pay off my car loan early?"
 * The AI service models the impact on cash flow, savings, and goals.
 *
 * FALLBACK STRATEGY: Unlike processAiCoreRequest which returns generic advice,
 * this function returns a zeroed-out scenario structure. This is because the
 * frontend expects a specific scenario data shape to render charts.
 *
 * @param {Record<string, unknown>} payload - Scenario parameters (type, amount, assumptions)
 * @param {string} requestId - Unique request ID for distributed tracing
 * @param {object} [options] - Optional configuration
 * @param {string} [options.userId] - User ID for concurrency tracking
 * @returns {Promise<Record<string, unknown>>} Scenario analysis results
 */
// Evaluates a financial what-if scenario by projecting income, expense, and debt changes.
// Dispatches scenario variables to AI Core Monte Carlo simulation endpoints.
// Returns baseline, projected delta figures, and financial recommendations.
export const processAiCoreScenario = async (
  payload: Record<string, unknown>,
  requestId: string,
  options?: { userId?: string; priority?: AiPriority }
): Promise<Record<string, unknown>> => {
  // Builds a zeroed-out scenario when the AI service is unavailable
  const buildScenarioFallback = (message: string) => ({
    scenario_type: String((payload as any)?.scenario_type || "expense"),
    amount: Number((payload as any)?.amount || 0),
    baseline: {
      monthly_income: 0,
      monthly_expenses: 0,
      monthly_surplus: 0,
      savings: 0,
      total_debt: 0,
    },
    delta: {
      monthly_surplus_change: 0,
      new_monthly_surplus: 0,
      savings_change_horizon: 0,
      projected_investment_value: null,
      emergency_fund_months_before: null,
      emergency_fund_months_after: null,
      goal_timeline_delta_months: 0,
    },
    assumptions: {
      months: Number((payload as any)?.assumptions?.months || 12),
      expected_return_pct: Number((payload as any)?.assumptions?.expected_return_pct || 0),
      inflation_pct: Number((payload as any)?.assumptions?.inflation_pct || 0),
    },
    recommendations: [],
    originalBudget: 0,
    newBudget: 0,
    savingsImpact: 0,
    goalDelay: 0,
    adjustments: [],
    request_id: requestId,
    fallback_used: true,
    message,
  });

  const startedAt = Date.now();
  const logCtx = { requestId, userId: options?.userId, endpoint: "what-if" };
  logEntry(svcLog, "processAiCoreScenario", logCtx);

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    priority: options?.priority,
    task: async () => {
      const env = getEnv();
      if (isCircuitOpen()) {
        const durationMs = Date.now() - startedAt;
        svcLog.warn({ ...logCtx, reason: "circuit_open", duration_ms: durationMs }, "AI Core scenario rejected: circuit breaker open");
        recordAiCoreRequest({ endpoint: "what-if", durationMs, fallbackUsed: true });
        return buildScenarioFallback("AI core temporarily unavailable");
      }

      try {
        const http = getResilientClient();
        const { data } = await http.post("/api/agents/what-if-scenario", payload, {
          headers: {
            "X-Request-Id": requestId,
          },
        });
        markSuccess();
        const durationMs = Date.now() - startedAt;
        recordAiCoreRequest({ endpoint: "what-if", durationMs, fallbackUsed: false });
        logExit(svcLog, "processAiCoreScenario", { ...logCtx, fallback_used: false }, durationMs);
        logSlowOperation(svcLog, "processAiCoreScenario", durationMs, 10_000);
        return {
          ...data,
          request_id: data?.request_id || requestId,
          fallback_used: Boolean(data?.fallback_used),
        };
      } catch (error) {
        markFailure(env, error);
        rethrowIfOverloaded(error);
        const durationMs = Date.now() - startedAt;
        recordAiCoreRequest({ endpoint: "what-if", durationMs, fallbackUsed: true });
        svcLog.error({ ...logCtx, error: extractErrorReason(error), duration_ms: durationMs }, "AI Core scenario failed");
        return buildScenarioFallback(extractErrorReason(error));
      }
    },
  });
};

// Returns current operational diagnostic metrics for the AI Core client connection.
// Exposes circuit breaker states, failure thresholds, base URLs, and last health check data.
// Utilized by health checks and monitoring dashboards to observe AI microservice state.
export const getAiCoreClientStatus = () => ({
  consecutiveFailures: breaker.snapshot().consecutiveFailures,
  circuitOpenUntil: breaker.snapshot().openUntil,
  circuitOpen: breaker.state !== "closed",
  circuitState: breaker.state,
  aiCoreBaseUrl: getEnv().PYTHON_API_URL,
  lastHealthCheckAt,
  lastHealthHealthy,
  lastHealthError,
});

/**
 * Response type for receipt OCR processing.
 * Extracted fields typically include: merchant name, date, total, tax, line items.
 */
// Structured response type representing the results of receipt optical character recognition.
// Contains parsed merchant metadata, line items, taxes, totals, and confidence metrics.
// Includes diagnostic warning arrays describing incomplete or low-confidence extractions.
export type AiCoreReceiptOcrResponse = {
  success: boolean; // Whether OCR processing succeeded
  extracted: Record<string, unknown>; // Extracted receipt fields (amounts, dates, etc.)
  confidence: Record<string, unknown>; // Confidence scores per extracted field
  warnings: string[]; // Processing warnings (e.g., low confidence, partial extraction)
  request_id: string; // Request ID for tracing
};

/**
 * Processes a receipt image through OCR to extract financial data.
 *
 * The image is sent as a raw binary buffer to the AI Core vision endpoint.
 * The AI service handles the actual OCR processing, field extraction, and
 * confidence scoring using its vision models.
 *
 * IMPORTANT: Uses maxBodyLength/maxContentLength: Infinity and a passthrough
 * transformRequest because we're sending raw binary data, not JSON.
 *
 * @param {object} payload - Receipt image and processing options
 * @param {Buffer} payload.image - Raw image bytes
 * @param {string} payload.contentType - MIME type (image/jpeg, image/png, etc.)
 * @param {string} [payload.lang] - Language hint for OCR (default: "en")
 * @param {string} [payload.currencyHint] - Expected currency for amount parsing (default: "USD")
 * @param {string} requestId - Unique request ID for tracing
 * @param {object} [options] - Optional configuration
 * @returns {Promise<AiCoreReceiptOcrResponse>} Extracted receipt data with confidence scores
 */
// Transmits a raw receipt image buffer to the AI Core vision model for data extraction.
// Parses merchant names, purchase dates, monetary totals, and line item arrays.
// Returns structured financial transaction drafts along with field confidence ratings.
export const processAiCoreReceiptOcr = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
    currencyHint?: string;
  },
  requestId: string,
  options?: { userId?: string; priority?: AiPriority }
): Promise<AiCoreReceiptOcrResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    priority: options?.priority,
    task: async () => {
      const env = getEnv();

      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "receipt_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          extracted: {},
          confidence: {},
          warnings: ["AI core circuit breaker open"],
          request_id: requestId,
        };
      }

      const healthy = await checkAiCoreHealth(env, requestId);
      if (!healthy) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "receipt_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          extracted: {},
          confidence: {},
          warnings: [lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed"],
          request_id: requestId,
        };
      }

      try {
        const http = getResilientClient();
        const { data } = await http.post("/api/vision/receipts/parse", payload.image, {
          params: {
            lang: payload.lang || "en",
            currencyHint: payload.currencyHint || "USD",
          },
          headers: {
            "X-Request-Id": requestId,
            "Content-Type": payload.contentType || "application/octet-stream",
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          transformRequest: [(body) => body],
        });

        markSuccess();
        recordAiCoreRequest({ endpoint: "receipt_ocr", durationMs: Date.now() - startedAt, fallbackUsed: false });

        return {
          success: data?.success !== false,
          extracted: data?.extracted && typeof data.extracted === "object" ? data.extracted : {},
          confidence: data?.confidence && typeof data.confidence === "object" ? data.confidence : {},
          warnings: Array.isArray(data?.warnings) ? data.warnings.map((w: unknown) => String(w)) : [],
          request_id: String(data?.request_id || requestId),
        };
      } catch (error) {
        markFailure(env, error);
        rethrowIfOverloaded(error);
        recordAiCoreRequest({ endpoint: "receipt_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          extracted: {},
          confidence: {},
          warnings: [extractErrorReason(error)],
          request_id: requestId,
        };
      }
    },
  });
};

/**
 * Response type for handwriting recognition.
 * Returns both raw recognized text and structured detected values (e.g., amounts, dates).
 */
// Output schema for handwriting recognition operations performed by AI Core vision models.
// Contains full raw transcribed text, detected numeric financial entities, and confidence scores.
// Includes diagnostic warning messages detailing blurry, illegible, or cropped image sections.
export type AiCoreHandwritingResponse = {
  success: boolean; // Whether recognition succeeded
  recognized_text: string; // Raw text extracted from the image
  confidence: Record<string, unknown>; // Confidence scores per detected element
  detected_values: Record<string, unknown>; // Structured values (amounts, dates, names)
  warnings: string[]; // Processing warnings
  request_id: string; // Request ID for tracing
};

/**
 * Processes a handwriting image to extract recognized text and structured values.
 *
 * @param {object} payload - Handwriting image and processing options
 * @param {Buffer} payload.image - Raw image bytes
 * @param {string} payload.contentType - MIME type of the image
 * @param {string} [payload.lang] - Language hint for recognition (default: "en")
 * @param {string} requestId - Unique request ID for tracing
 * @param {object} [options] - Optional configuration
 * @returns {Promise<AiCoreHandwritingResponse>} Recognized text and structured data
 */
// Submits a handwritten document image buffer to AI Core for text and numeric extraction.
// Detects numerical balances, payee annotations, and unstructured ledger text.
// Returns parsed text and detected value maps with confidence scores for manual review.
export const processAiCoreHandwriting = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
  },
  requestId: string,
  options?: { userId?: string; priority?: AiPriority }
): Promise<AiCoreHandwritingResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    priority: options?.priority,
    task: async () => {
      const env = getEnv();

      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "handwriting", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          confidence: {},
          detected_values: {},
          warnings: ["AI core circuit breaker open"],
          request_id: requestId,
        };
      }

      const healthy = await checkAiCoreHealth(env, requestId);
      if (!healthy) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "handwriting", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          confidence: {},
          detected_values: {},
          warnings: [lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed"],
          request_id: requestId,
        };
      }

      try {
        const http = getResilientClient();
        const { data } = await http.post("/api/vision/handwriting/recognize", payload.image, {
          params: {
            lang: payload.lang || "en",
          },
          headers: {
            "X-Request-Id": requestId,
            "Content-Type": payload.contentType || "application/octet-stream",
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          transformRequest: [(body) => body],
        });

        markSuccess();
        recordAiCoreRequest({ endpoint: "handwriting", durationMs: Date.now() - startedAt, fallbackUsed: false });

        return {
          success: data?.success !== false,
          recognized_text: String(data?.recognized_text || ""),
          confidence: data?.confidence && typeof data.confidence === "object" ? data.confidence : {},
          detected_values: data?.detected_values && typeof data.detected_values === "object" ? data.detected_values : {},
          warnings: Array.isArray(data?.warnings) ? data.warnings.map((w: unknown) => String(w)) : [],
          request_id: String(data?.request_id || requestId),
        };
      } catch (error) {
        markFailure(env, error);
        rethrowIfOverloaded(error);
        recordAiCoreRequest({ endpoint: "handwriting", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          confidence: {},
          detected_values: {},
          warnings: [extractErrorReason(error)],
          request_id: requestId,
        };
      }
    },
  });
};

/**
 * Response type for generic OCR processing.
 * Returns recognized text broken down into individual lines with confidence scores.
 */
// Response structure for general-purpose optical character recognition on arbitrary images.
// Details recognized text both as a unified transcript and segmented per-line arrays.
// Provides individual line confidence metrics to assist validation and correction flows.
export type AiCoreGenericOcrResponse = {
  success: boolean; // Whether OCR processing succeeded
  recognized_text: string; // Full text extracted from the image
  lines: Array<{ text: string; confidence: number }>; // Per-line breakdown with confidence
  warnings: string[]; // Processing warnings
  request_id: string; // Request ID for tracing
};

/**
 * Processes a general image through OCR to extract text.
 *
 * Unlike receipt-specific OCR, this is a general-purpose text extraction
 * suitable for documents, screenshots, invoices, etc.
 *
 * @param {object} payload - Image and processing options
 * @param {Buffer} payload.image - Raw image bytes
 * @param {string} payload.contentType - MIME type of the image
 * @param {string} [payload.lang] - Language hint for OCR (default: "en")
 * @param {string} requestId - Unique request ID for tracing
 * @param {object} [options] - Optional configuration
 * @returns {Promise<AiCoreGenericOcrResponse>} Extracted text with per-line confidence
 */
// Extracts arbitrary text from an uploaded image buffer using generic AI Core OCR pipelines.
// Analyzes invoices, statements, or documents and parses recognized characters into lines.
// Returns structured text blocks accompanied by line-by-line optical confidence ratings.
export const processAiCoreGenericOcr = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
  },
  requestId: string,
  options?: { userId?: string; priority?: AiPriority }
): Promise<AiCoreGenericOcrResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    priority: options?.priority,
    task: async () => {
      const env = getEnv();

      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "generic_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          lines: [],
          warnings: ["AI core circuit breaker open"],
          request_id: requestId,
        };
      }

      const healthy = await checkAiCoreHealth(env, requestId);
      if (!healthy) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "generic_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          lines: [],
          warnings: [lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed"],
          request_id: requestId,
        };
      }

      try {
        const http = getResilientClient();
        const { data } = await http.post("/api/vision/ocr/extract", payload.image, {
          params: {
            lang: payload.lang || "en",
          },
          headers: {
            "X-Request-Id": requestId,
            "Content-Type": payload.contentType || "application/octet-stream",
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          transformRequest: [(body) => body],
        });

        markSuccess();
        recordAiCoreRequest({ endpoint: "generic_ocr", durationMs: Date.now() - startedAt, fallbackUsed: false });

        const lines = Array.isArray(data?.lines)
          ? data.lines
              .filter((line: any) => line && typeof line === "object")
              .map((line: any) => ({
                text: String(line.text || ""),
                confidence: Number(line.confidence || 0),
              }))
          : [];

        return {
          success: data?.success !== false,
          recognized_text: String(data?.recognized_text || ""),
          lines,
          warnings: Array.isArray(data?.warnings) ? data.warnings.map((warning: unknown) => String(warning)) : [],
          request_id: String(data?.request_id || requestId),
        };
      } catch (error) {
        markFailure(env, error);
        rethrowIfOverloaded(error);
        recordAiCoreRequest({ endpoint: "generic_ocr", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return {
          success: false,
          recognized_text: "",
          lines: [],
          warnings: [extractErrorReason(error)],
          request_id: requestId,
        };
      }
    },
  });
};

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. RESILIENCE FIRST: Every function in this module is designed to never crash
//    the calling code. Circuit breaker + health checks + fallbacks ensure the
//    rest of the application continues working even when the AI service is down.
//
// 2. OBSERVABILITY BUILT IN: Every request (success or failure) records metrics
//    including duration, endpoint name, and fallback usage. This enables
//    monitoring dashboards to track AI service health over time.
//
// 3. CONCURRENCY CONTROL: All AI requests pass through runWithAiCoreConcurrency,
//    which acts as a semaphore. This prevents a burst of user requests from
//    overwhelming the AI service and causing cascading timeouts.
//
// 4. DEFENSIVE NORMALIZATION: The normalizeProcessResponse function treats all
//    AI service responses as untrusted data, applying type coercion and defaults
//    to every field. This prevents runtime crashes from unexpected response shapes.
//
// 5. DEVELOPER EXPERIENCE: In non-production environments, error messages include
//    helpful hints (like "Start AI Core with uvicorn on port 8001"). In production,
//    errors are sanitized to avoid leaking internal details.
//
// 6. CONSISTENT PATTERN: All six exported functions follow the same structure:
//    concurrency check -> circuit breaker -> health check -> HTTP call -> normalize
//    This makes the code predictable and easy to maintain.
// =============================================================================

/**
 * Options for {@link aiCoreRequest}, the shared entry point for gateway routes and services that proxy
 * to AI Core (status/session GETs, newsletter generation) so they get the same connect/read timeouts,
 * jittered idempotent retries, Retry-After handling and optional breaker + admission control as the
 * main pipeline.
 */
// Configuration options for routing custom generic requests through the AI Core client.
// Supports HTTP method selection, payloads, custom timeouts, and circuit breaker gating.
// Enables optional concurrency queue enrollment for operations consuming model tokens.
export type AiCoreProxyOptions = {
  method: "get" | "post";
  path: string;
  data?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Read timeout override (ms). */
  timeoutMs?: number;
  /** Override the default (GET and most POSTs are idempotent; process/stream/resume are not). */
  idempotent?: boolean;
  /** Gate on and report to the circuit breaker. Use for generation work, not diagnostics. Default false. */
  useBreaker?: boolean;
  /** Run through AI admission control (queue + shedding). Use for work that spends LLM budget. */
  queue?: { userId?: string; priority?: AiPriority };
};

/**
 * Calls AI Core through the shared resilient client. Resolves with `{ data, status }`; rejects with
 * the axios error (so callers can map `err.response.status`), {@link AiCoreOverloadedError},
 * {@link AiCoreUnavailableError} (breaker open) or an AiCapacityError (queue shed).
 */
// General-purpose resilient dispatcher for arbitrary requests targeting AI Core endpoints.
// Applies circuit breaker evaluation, resilient retry loops, and concurrency scheduling.
// Returns raw HTTP status codes and typed response data payloads to calling services.
export const aiCoreRequest = async <T = any>(options: AiCoreProxyOptions): Promise<{ data: T; status: number }> => {
  const run = async () => {
    if (options.useBreaker && isCircuitOpen()) {
      const remainingMs = Math.max(0, breaker.snapshot().openUntil - Date.now());
      throw new AiCoreUnavailableError(Math.max(1, Math.ceil(remainingMs / 1000)));
    }
    try {
      const response = await callAiCore(
        options.method,
        options.path,
        options.data,
        { params: options.params, headers: options.headers, ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}) },
        options.idempotent,
      );
      if (options.useBreaker) markSuccess();
      return { data: response.data as T, status: response.status };
    } catch (error) {
      if (options.useBreaker) markFailure(getEnv(), error);
      throw error;
    }
  };
  return options.queue ? runWithAiCoreConcurrency({ ...options.queue, task: run }) : run();
};

// Evaluates whether an error signifies that AI Core is overloaded or in circuit-open cooldown.
// Identifies instances of AiCoreOverloadedError or AiCoreUnavailableError.
// Allows upstream callers to differentiate temporary capacity limits from fatal errors.
export const isAiCoreOverloadedError = (error: unknown): error is AiCoreOverloadedError | AiCoreUnavailableError =>
  error instanceof AiCoreOverloadedError || error instanceof AiCoreUnavailableError;

/** Generates newsletter content (idempotent, batch priority, breaker-protected). */
// Dispatches a batch request to AI Core to generate periodic financial newsletter content.
// Configures idempotent execution semantics and enrolls in low-priority batch queues.
// Returns synthesized newsletter summaries and recommendations for user distribution.
export const processAiCoreNewsletter = (
  payload: Record<string, unknown>,
  options: { requestId?: string; timeoutMs?: number; userId?: string; priority?: AiPriority } = {},
) =>
  aiCoreRequest({
    method: "post",
    path: "/api/agents/newsletter",
    data: payload,
    headers: aiCoreHeaders({ requestId: options.requestId, contentType: "application/json" }),
    timeoutMs: options.timeoutMs ?? 30_000,
    idempotent: true,
    useBreaker: true,
    queue: { userId: options.userId, priority: options.priority ?? "batch" },
  });
