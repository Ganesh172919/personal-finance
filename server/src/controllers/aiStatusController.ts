import { Request, Response } from "express";
import axios from "axios";
import { getAiCoreClientStatus } from "../services/aiCoreClient";
import { getEnv } from "../config/env";

const summarizeUpstreamError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const detail = data?.detail || data?.message;
    const code = (error as any)?.code;

    if (detail && status) {
      return `HTTP ${status}: ${String(detail)}`;
    }
    if (detail) {
      return String(detail);
    }
    if (code) {
      return `${String(code)}: ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const getAiCoreStatus = async (req: Request, res: Response) => {
  const env = getEnv();
  const AI_CORE_BASE_URL = env.PYTHON_API_URL;
  const STATUS_TIMEOUT_MS = env.AI_CORE_STATUS_TIMEOUT_MS;
  const requestId = req.requestId;

  const [healthResult, rateLimitResult] = await Promise.allSettled([
    axios.get(`${AI_CORE_BASE_URL}/health`, {
      timeout: STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": requestId }
    }),
    axios.get(`${AI_CORE_BASE_URL}/api/rate-limit/status`, {
      timeout: STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": requestId }
    })
  ]);

  const healthOk = healthResult.status === "fulfilled";
  const rateLimitOk = rateLimitResult.status === "fulfilled";

  const health =
    healthOk ? healthResult.value.data : { status: "unavailable" };
  const rateLimit =
    rateLimitOk ? rateLimitResult.value.data : { success: false };

  res.json({
    ai_core: {
      healthy: healthOk,
      base_url: AI_CORE_BASE_URL,
      request_id: requestId,
      health,
      health_error: healthOk ? null : summarizeUpstreamError(healthResult.reason),
      rate_limit_status: rateLimit,
      rate_limit_error: rateLimitOk ? null : summarizeUpstreamError(rateLimitResult.reason),
    },
    server: {
      ai_core_client: getAiCoreClientStatus()
    }
  });
};
