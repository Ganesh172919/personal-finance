import axios, { AxiosError, type AxiosInstance } from "axios";
import { getEnv, type Env } from "../config/env";
import { recordAiCoreRequest, setAiCircuitBreakerState } from "../observability/metrics";
import { runWithAiCoreConcurrency } from "./aiConcurrency";

export interface WorkflowTraceEntry {
  agent: string;
  startedAt: string;
  endedAt: string;
  status: string;
  error?: string;
}

export interface AiCoreProcessRequest {
  user_input: string;
  user_profile: Record<string, unknown> | null;
  org_id?: string;
  user_id?: string;
  session_id?: string;
  resume_from_checkpoint?: boolean;
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
  session_summary?: string;
  options?: { narrative?: boolean };
}

export interface AiCoreToolCall {
  id: string;
  title: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: "low" | "medium" | "high";
}

export interface AiCoreProcessResponse {
  success: boolean;
  final_output: string;
  agent: string;
  actionType?: string;
  priority?: "low" | "medium" | "high";
  plan?: Record<string, unknown>;
  usage?: {
    tokens_in: number;
    tokens_out: number;
    total_tokens?: number;
    cost_usd?: number;
    models?: string[];
  };
  insights: Array<{
    agent: string;
    title: string;
    description: string;
    actionType: string;
    priority?: "low" | "medium" | "high";
  }>;
  analysis_type: string;
  agents_involved: string[];
  detailed_analysis: Record<string, unknown>;
  workflow_trace: WorkflowTraceEntry[];
  tool_calls?: AiCoreToolCall[];
  fallback_used: boolean;
  llm_call_count: number;
  request_id: string;
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

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let lastHealthCheckAt = 0;
let lastHealthHealthy = true;
let lastHealthError: string | null = null;

let http: AxiosInstance | null = null;
let httpBaseUrl = "";
let httpTimeoutMs = 0;

const getHttpClient = () => {
  const env = getEnv();
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

  if (httpTimeoutMs !== env.AI_CORE_TIMEOUT_MS) {
    httpTimeoutMs = env.AI_CORE_TIMEOUT_MS;
    http.defaults.timeout = httpTimeoutMs;
  }

  return http;
};

const nowIso = () => new Date().toISOString();

const normalizeProcessResponse = (data: any, requestId: string): AiCoreProcessResponse => {
  const workflowTrace = Array.isArray(data?.workflow_trace)
    ? data.workflow_trace.map((entry: any) => ({
        agent: String(entry?.agent || "unknown"),
        startedAt: String(entry?.startedAt || nowIso()),
        endedAt: String(entry?.endedAt || nowIso()),
        status: String(entry?.status || "unknown"),
        error: entry?.error ? String(entry.error) : undefined,
      }))
    : [];

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

const extractErrorReason = (error: unknown) => {
  const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
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

const isCircuitOpen = () => Date.now() < circuitOpenUntil;

const markSuccess = () => {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  setAiCircuitBreakerState({ circuitOpen: false, consecutiveFailures });
};

const markFailure = (env: Env) => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= env.AI_CORE_CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + env.AI_CORE_CIRCUIT_OPEN_MS;
  }
  setAiCircuitBreakerState({ circuitOpen: isCircuitOpen(), consecutiveFailures });
};

const checkAiCoreHealth = async (env: Env, requestId: string): Promise<boolean> => {
  const now = Date.now();
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

export const processAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string }
): Promise<AiCoreProcessResponse> => {
  const startedAt = Date.now();

  return runWithAiCoreConcurrency({
    userId: options?.userId,
    task: async () => {
      const env = getEnv();

      if (isCircuitOpen()) {
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: true });
        return buildFallbackResponse(requestId, "AI core circuit breaker open", {
          includeReasonInOutput: env.NODE_ENV !== "production",
        });
      }

      const healthy = await checkAiCoreHealth(env, requestId);
      if (!healthy) {
        markFailure(env);
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: true });
        const detail = lastHealthError ? `AI core health check failed: ${lastHealthError}` : "AI core health check failed";
        const hint =
          env.NODE_ENV !== "production"
            ? ` (Is AI Core running at ${env.PYTHON_API_URL}? Start it with uvicorn on port 8001.)`
            : "";
        return buildFallbackResponse(requestId, `${detail}${hint}`, {
          includeReasonInOutput: env.NODE_ENV !== "production",
        });
      }

      try {
        const http = getHttpClient();
        const { data } = await http.post("/api/agents/process", payload, {
          headers: {
            "X-Request-Id": requestId,
          },
        });

        markSuccess();
        recordAiCoreRequest({ endpoint: "process", durationMs: Date.now() - startedAt, fallbackUsed: false });
        // NOTE: Usage tracking happens in the background. We don't block the response.
        return normalizeProcessResponse(data, requestId);
      } catch (error) {
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

export const streamAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string,
  options?: { userId?: string }
): Promise<any> => {
  const startedAt = Date.now();

  const env = getEnv();

  // For streaming, we throw errors instead of returning a fallback block
  // This allows the controller to handle SSE fallback formatting
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
    // Return the response object directly (responseType: stream)
    const response = await http.post("/api/agents/process/stream", payload, {
      headers: {
        "X-Request-Id": requestId,
        Accept: "text/event-stream",
      },
      responseType: "stream",
    });

    markSuccess();
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: false });
    return response.data;
  } catch (error) {
    markFailure(env);
    recordAiCoreRequest({ endpoint: "process_stream", durationMs: Date.now() - startedAt, fallbackUsed: true });
    throw new Error(extractErrorReason(error));
  }
};

export const processAiCoreScenario = async (
  payload: Record<string, unknown>,
  requestId: string,
  options?: { userId?: string }
): Promise<Record<string, unknown>> => {
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

export type AiCoreReceiptOcrResponse = {
  success: boolean;
  extracted: Record<string, unknown>;
  confidence: Record<string, unknown>;
  warnings: string[];
  request_id: string;
};

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

export type AiCoreHandwritingResponse = {
  success: boolean;
  recognized_text: string;
  confidence: Record<string, unknown>;
  detected_values: Record<string, unknown>;
  warnings: string[];
  request_id: string;
};

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

export type AiCoreGenericOcrResponse = {
  success: boolean;
  recognized_text: string;
  lines: Array<{ text: string; confidence: number }>;
  warnings: string[];
  request_id: string;
};

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
