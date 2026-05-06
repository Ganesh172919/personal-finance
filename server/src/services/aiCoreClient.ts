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
 * @module services/aiCoreClient
 */

import axios, { AxiosError, type AxiosInstance } from "axios"; // HTTP client library (chosen for interceptor support and streaming)
import { getEnv, type Env } from "../config/env"; // Typed access to environment variables
import { recordAiCoreRequest, setAiCircuitBreakerState } from "../observability/metrics"; // Prometheus-style metrics for monitoring
import { runWithAiCoreConcurrency } from "./aiConcurrency"; // Semaphore-based concurrency limiter

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
export interface WorkflowTraceEntry {
  agent: string; // Agent name (e.g., "budget_agent", "debt_agent")
  startedAt: string; // ISO timestamp when agent started processing
  endedAt: string; // ISO timestamp when agent finished
  status: string; // Execution status (e.g., "completed", "failed", "skipped")
  error?: string; // Error message if the agent encountered a failure
}

/**
 * AI Core Process Request Interface
 *
 * Defines the structure of requests sent to the AI Core service.
 */
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
  options?: { narrative?: boolean; include_evidence?: boolean; include_confidence?: boolean; include_actions?: boolean }; // Processing options
}

/**
 * AI Core Tool Call Interface
 *
 * Represents a tool call that the AI wants to execute.
 */
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
export interface AiCoreProcessResponse {
  success: boolean; // Whether the request was successful
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
let consecutiveFailures = 0; // Reset to 0 on every successful request
let circuitOpenUntil = 0; // Unix timestamp (ms); 0 means circuit is closed
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
const getHttpClient = () => {
  const env = getEnv();

  // Create new client if none exists or base URL changed
  if (!http || httpBaseUrl !== env.PYTHON_API_URL) {
    httpBaseUrl = env.PYTHON_API_URL;
    httpTimeoutMs = env.AI_CORE_TIMEOUT_MS;
    http = axios.create({
      baseURL: httpBaseUrl,
      timeout: httpTimeoutMs,
      headers: {
        "Content-Type": "application/json",
      },
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
const normalizeProcessResponse = (data: any, requestId: string): AiCoreProcessResponse => {
  // Normalize workflow trace -- each entry is independently validated
  const workflowTrace = Array.isArray(data?.workflow_trace)
    ? data.workflow_trace.map((entry: any) => ({
        agent: String(entry?.agent || "unknown"),
        startedAt: String(entry?.startedAt || nowIso()),
        endedAt: String(entry?.endedAt || nowIso()),
        status: String(entry?.status || "unknown"),
        error: entry?.error ? String(entry.error) : undefined,
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
  const usageRaw = data?.usage;
  const usage =
    usageRaw && typeof usageRaw === "object" && !Array.isArray(usageRaw)
      ? {
          tokens_in: Math.max(0, Number((usageRaw as any).tokens_in || 0)),
          tokens_out: Math.max(0, Number((usageRaw as any).tokens_out || 0)),
          total_tokens: Number.isFinite(Number((usageRaw as any).total_tokens))
            ? Math.max(0, Number((usageRaw as any).total_tokens))
            : undefined,
          cost_usd: Number.isFinite(Number((usageRaw as any).cost_usd))
            ? Math.max(0, Number((usageRaw as any).cost_usd))
            : undefined,
          models: Array.isArray((usageRaw as any).models)
            ? (usageRaw as any).models.map((m: unknown) => String(m))
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
 * Checks if circuit breaker is open.
 *
 * @returns {boolean} True if circuit is open
 */
const isCircuitOpen = () => Date.now() < circuitOpenUntil;

/**
 * Marks a successful request (resets circuit breaker).
 */
const markSuccess = () => {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  setAiCircuitBreakerState({ circuitOpen: false, consecutiveFailures });
};

/**
 * Marks a failed request (increments failure counter).
 *
 * @param {Env} env - Environment configuration
 */
const markFailure = (env: Env) => {
  consecutiveFailures += 1;
  // Open circuit if failure threshold reached
  if (consecutiveFailures >= env.AI_CORE_CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + env.AI_CORE_CIRCUIT_OPEN_MS;
  }
  setAiCircuitBreakerState({ circuitOpen: isCircuitOpen(), consecutiveFailures });
};

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
 * 3. Check service health -- if unhealthy, mark failure and return fallback
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
export const processAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string }
): Promise<AiCoreProcessResponse> => {
  const startedAt = Date.now();

  // runWithAiCoreConcurrency acts as a semaphore, limiting concurrent AI requests
  // per user to prevent a single user from exhausting shared AI resources
  return runWithAiCoreConcurrency({
    userId: options?.userId,
    task: async () => {
      const env = getEnv();

      // STEP 1: Circuit breaker check -- fastest possible rejection path
      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return buildFallbackResponse(requestId, "AI core circuit breaker open", {
          includeReasonInOutput: env.NODE_ENV !== "production",
        });
      }

      // STEP 2: Health check -- verifies the AI service is reachable
      // Uses cached result to avoid redundant network calls
      const healthy = await checkAiCoreHealth(env, requestId);
      if (!healthy) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: true });
        const detail = lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed";
        // In development, include a helpful hint about starting the AI service
        const hint =
          env.NODE_ENV !== "production"
            ? ` (Is AI Core running at ${env.PYTHON_API_URL}? Start it with uvicorn on port 8001.)`
            : "";
        return buildFallbackResponse(requestId, `${detail}${hint}`, {
          includeReasonInOutput: env.NODE_ENV !== "production",
        });
      }

      try {
        // STEP 3: Make the actual AI request
        const http = getHttpClient();
        const { data } = await http.post("/api/agents/process", payload, {
          headers: {
            "X-Request-Id": requestId, // Propagated for distributed tracing
          },
        });

        // Success resets the circuit breaker failure counter
        markSuccess();
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: false });
        // NOTE: Usage tracking (tokens, cost) happens in the background.
        // We intentionally don't await it to minimize response latency.
        return normalizeProcessResponse(data, requestId);
      } catch (error) {
        // STEP 4: On failure, record the error and return a safe fallback
        markFailure(env);
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: true });
        const detail = extractErrorReason(error);
        const hint = env.NODE_ENV !== "production" ? ` (AI Core base URL: ${env.PYTHON_API_URL})` : "";
        return buildFallbackResponse(requestId, `${detail}${hint}`, {
          includeReasonInOutput: env.NODE_ENV !== "production",
        });
      }
    },
  });
};

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
export const streamAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string }
): Promise<any> => {
  const startedAt = Date.now();

  const env = getEnv();

  // For streaming, we throw errors instead of returning a fallback block.
  // The controller (SSE endpoint) is responsible for catching these and
  // sending an appropriate error event to the client.
  if (isCircuitOpen()) {
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: true });
    throw new Error("AI core circuit breaker open");
  }

  const healthy = await checkAiCoreHealth(env, requestId);
  if (!healthy) {
    markFailure(env);
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: true });
    const detail = lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed";
    throw new Error(detail);
  }

  try {
    const http = getHttpClient();
    // Return the raw stream object -- the controller will pipe it to the SSE response
    const response = await http.post("/api/agents/process/stream", payload, {
      headers: {
        "X-Request-Id": requestId,
        Accept: "text/event-stream", // Tells the AI service to return SSE format
      },
      responseType: "stream", // Tells Axios not to buffer the response
    });

    markSuccess();
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: false });
    return response.data; // This is a Readable stream
  } catch (error) {
    markFailure(env);
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: true });
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
export const processAiCoreScenario = async (
  payload: Record<string, unknown>,
  requestId: string,
  options?: { userId?: string }
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

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    task: async () => {
      const env = getEnv();
      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "what-if", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return buildScenarioFallback("AI core temporarily unavailable");
      }

      try {
        const http = getHttpClient();
        const { data } = await http.post("/api/agents/what-if-scenario", payload, {
          headers: {
            "X-Request-Id": requestId,
          },
        });
        markSuccess();
        recordAiCoreRequest({ endpoint: "what-if", durationMs: Date.now() - startedAt, fallbackUsed: false });
        return {
          ...data,
          request_id: data?.request_id || requestId,
          fallback_used: Boolean(data?.fallback_used),
        };
      } catch (error) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "what-if", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return buildScenarioFallback(extractErrorReason(error));
      }
    },
  });
};

export const getAiCoreClientStatus = () => ({
  consecutiveFailures,
  circuitOpenUntil,
  circuitOpen: isCircuitOpen(),
  aiCoreBaseUrl: getEnv().PYTHON_API_URL,
  lastHealthCheckAt,
  lastHealthHealthy,
  lastHealthError,
});

/**
 * Response type for receipt OCR processing.
 * Extracted fields typically include: merchant name, date, total, tax, line items.
 */
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
export const processAiCoreReceiptOcr = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
    currencyHint?: string;
  },
  requestId: string,
  options?: { userId?: string }
): Promise<AiCoreReceiptOcrResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
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
        const http = getHttpClient();
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
        markFailure(env);
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
export const processAiCoreHandwriting = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
  },
  requestId: string,
  options?: { userId?: string }
): Promise<AiCoreHandwritingResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
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
        const http = getHttpClient();
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
        markFailure(env);
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
export const processAiCoreGenericOcr = async (
  payload: {
    image: Buffer;
    contentType: string;
    lang?: string;
  },
  requestId: string,
  options?: { userId?: string }
): Promise<AiCoreGenericOcrResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
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
        const http = getHttpClient();
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
        markFailure(env);
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
