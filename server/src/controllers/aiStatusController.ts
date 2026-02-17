import { Request, Response } from "express";
import axios from "axios";
import { getAiCoreClientStatus } from "../services/aiCoreClient";
import { getEnv } from "../config/env";

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

  const health =
    healthResult.status === "fulfilled" ? healthResult.value.data : { status: "unavailable" };
  const rateLimit =
    rateLimitResult.status === "fulfilled" ? rateLimitResult.value.data : { success: false };

  res.json({
    ai_core: {
      healthy: healthResult.status === "fulfilled",
      request_id: requestId,
      health,
      rate_limit_status: rateLimit
    },
    server: {
      ai_core_client: getAiCoreClientStatus()
    }
  });
};
