import axios, { AxiosError } from "axios";

const AI_CORE_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:8001";
const AI_CORE_TIMEOUT_MS = Number(process.env.AI_CORE_TIMEOUT_MS || 15000);
const AI_CORE_HEALTH_TIMEOUT_MS = Number(process.env.AI_CORE_HEALTH_TIMEOUT_MS || 2500);
const CIRCUIT_FAILURE_THRESHOLD = Number(process.env.AI_CORE_CIRCUIT_FAILURE_THRESHOLD || 3);
const CIRCUIT_OPEN_MS = Number(process.env.AI_CORE_CIRCUIT_OPEN_MS || 30000);
const HEALTH_CACHE_MS = Number(process.env.AI_CORE_HEALTH_CACHE_MS || 5000);

export interface WorkflowTraceEntry {
  agent: string;
  startedAt: string;
  endedAt: string;
  status: string;
  error?: string;
}

export interface AiCoreProcessRequest {
  user_input: string;
  user_profile: Record<string, unknown>;
}

export interface AiCoreProcessResponse {
  success: boolean;
  final_output: string;
  agent: string;
  actionType?: string;
  priority?: "low" | "medium" | "high";
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
  fallback_used: boolean;
  llm_call_count: number;
  request_id: string;
}

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let lastHealthCheckAt = 0;
let lastHealthHealthy = true;

const http = axios.create({
  baseURL: AI_CORE_BASE_URL,
  timeout: AI_CORE_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

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

  return {
    success: data?.success !== false,
    final_output: String(data?.final_output || data?.response || ""),
    agent: String(data?.agent || "master"),
    actionType: data?.actionType ? String(data.actionType) : undefined,
    priority: ["low", "medium", "high"].includes(String(data?.priority))
      ? (data.priority as "low" | "medium" | "high")
      : "medium",
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
    fallback_used: Boolean(data?.fallback_used),
    llm_call_count: Number.isFinite(Number(data?.llm_call_count)) ? Number(data.llm_call_count) : 0,
    request_id: String(data?.request_id || requestId),
  };
};

const buildFallbackResponse = (requestId: string, reason: string): AiCoreProcessResponse => {
  const timestamp = nowIso();
  return {
    success: true,
    final_output:
      "AI analysis is temporarily unavailable. Safe fallback: keep monthly cash flow positive, " +
      "protect emergency savings, prioritize high-interest debt, and invest consistently in diversified assets.",
    agent: "master",
    actionType: "review",
    priority: "medium",
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
};

const markFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }
};

const checkAiCoreHealth = async (requestId: string): Promise<boolean> => {
  const now = Date.now();
  if (now - lastHealthCheckAt < HEALTH_CACHE_MS) {
    return lastHealthHealthy;
  }

  lastHealthCheckAt = now;

  try {
    await axios.get(`${AI_CORE_BASE_URL}/health`, {
      timeout: AI_CORE_HEALTH_TIMEOUT_MS,
      headers: {
        "X-Request-Id": requestId,
      },
    });
    lastHealthHealthy = true;
    return true;
  } catch {
    lastHealthHealthy = false;
    return false;
  }
};

export const processAiCoreRequest = async (
  payload: AiCoreProcessRequest,
  requestId: string
): Promise<AiCoreProcessResponse> => {
  if (isCircuitOpen()) {
    return buildFallbackResponse(requestId, "AI core circuit breaker open");
  }

  const healthy = await checkAiCoreHealth(requestId);
  if (!healthy) {
    markFailure();
    return buildFallbackResponse(requestId, "AI core health check failed");
  }

  try {
    const { data } = await http.post("/api/agents/process", payload, {
      headers: {
        "X-Request-Id": requestId,
      },
    });

    markSuccess();
    return normalizeProcessResponse(data, requestId);
  } catch (error) {
    markFailure();
    return buildFallbackResponse(requestId, extractErrorReason(error));
  }
};

export const processAiCoreScenario = async (
  payload: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> => {
  if (isCircuitOpen()) {
    return {
      originalBudget: 0,
      newBudget: 0,
      savingsImpact: 0,
      goalDelay: 0,
      adjustments: [],
      request_id: requestId,
      fallback_used: true,
      message: "AI core temporarily unavailable",
    };
  }

  try {
    const { data } = await http.post("/api/agents/what-if-scenario", payload, {
      headers: {
        "X-Request-Id": requestId,
      },
    });
    markSuccess();
    return {
      ...data,
      request_id: data?.request_id || requestId,
      fallback_used: Boolean(data?.fallback_used),
    };
  } catch (error) {
    markFailure();
    return {
      originalBudget: 0,
      newBudget: 0,
      savingsImpact: 0,
      goalDelay: 0,
      adjustments: [],
      request_id: requestId,
      fallback_used: true,
      message: extractErrorReason(error),
    };
  }
};

export const getAiCoreClientStatus = () => ({
  consecutiveFailures,
  circuitOpenUntil,
  circuitOpen: isCircuitOpen(),
  aiCoreBaseUrl: AI_CORE_BASE_URL,
});
