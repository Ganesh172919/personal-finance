import { Router } from "express";
import passport from "passport";
import {
  processAICommand,
  processAiStream,
  processWhatIfScenario,
  getFinancialProfile,
  updateFinancialProfile,
  getAgentOutputs,
  getRecentAgentOutputs,
  getAgentOutputById,
  submitAgentOutputFeedback,
  addInvestment
} from "../controllers/aiController";
import { getAiCoreStatus } from "../controllers/aiStatusController";
import { validate } from "../middleware/validate";
import {
  addInvestmentBodySchema,
  agentOutputFeedbackBodySchema,
  processCommandBodySchema,
  recentAgentOutputsQuerySchema,
  updateFinancialProfileBodySchema,
  whatIfScenarioBodySchema
} from "../schemas/aiSchemas";
import { objectIdSchema, userIdParamSchema } from "../schemas/common";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

// All routes require authentication
router.use(passport.authenticate("jwt", { session: false }));

// AI processing routes
router.post("/process-command", validate({ body: processCommandBodySchema }), asyncRoute(processAICommand));
router.post("/ai/process/stream", validate({ body: processCommandBodySchema }), asyncRoute(processAiStream));
router.post("/scenarios/what-if", validate({ body: whatIfScenarioBodySchema }), asyncRoute(processWhatIfScenario));
router.get("/ai-core/status", asyncRoute(getAiCoreStatus));
router.get("/ai-core/providers", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  try {
    const result = await axios.get(`${env.PYTHON_API_URL}/api/providers`, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
    });
    res.json({ ...result.data, request_id: req.requestId });
  } catch (err: any) {
    res.status(502).json({
      message: "AI Core providers endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// Enhanced AI status endpoint - proxies to AI Core /api/ai/status
router.get("/ai-core/ai/status", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  try {
    const result = await axios.get(`${env.PYTHON_API_URL}/api/ai/status`, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
    });
    res.json(result.data);
  } catch (err: any) {
    res.status(502).json({
      message: "AI Core enhanced status endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// AI sessions list endpoint
router.get("/ai-core/ai/sessions", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  const { org_id, user_id, limit } = req.query;
  try {
    const params: Record<string, string> = {};
    if (org_id) params.org_id = org_id;
    if (user_id) params.user_id = user_id;
    if (limit) params.limit = limit;

    const result = await axios.get(`${env.PYTHON_API_URL}/api/ai/sessions`, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
      params,
    });
    res.json(result.data);
  } catch (err: any) {
    res.status(502).json({
      message: "AI Core sessions endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// AI session detail endpoint
router.get("/ai-core/ai/sessions/:sessionId", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  const { sessionId } = req.params;
  try {
    const result = await axios.get(`${env.PYTHON_API_URL}/api/ai/sessions/${sessionId}`, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
    });
    res.json(result.data);
  } catch (err: any) {
    if (err.response?.status === 404) {
      res.status(404).json({
        message: "Session not found",
        code: "SESSION_NOT_FOUND",
        request_id: req.requestId,
      });
    } else {
      res.status(502).json({
        message: "AI Core session detail endpoint unreachable",
        code: "AI_CORE_UNAVAILABLE",
        request_id: req.requestId,
      });
    }
  }
}));

// AI session resume endpoint
router.post("/ai-core/ai/sessions/:sessionId/resume", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  const { sessionId } = req.params;
  try {
    const result = await axios.post(`${env.PYTHON_API_URL}/api/ai/sessions/${sessionId}/resume`, {}, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
    });
    res.json(result.data);
  } catch (err: any) {
    if (err.response?.status === 404) {
      res.status(404).json({
        message: "Session not found",
        code: "SESSION_NOT_FOUND",
        request_id: req.requestId,
      });
    } else if (err.response?.status === 400) {
      res.status(400).json({
        message: err.response?.data?.detail || "Cannot resume session",
        code: "SESSION_RESUME_ERROR",
        request_id: req.requestId,
      });
    } else {
      res.status(502).json({
        message: "AI Core session resume endpoint unreachable",
        code: "AI_CORE_UNAVAILABLE",
        request_id: req.requestId,
      });
    }
  }
}));

// AI models list endpoint
router.get("/ai-core/ai/models", asyncRoute(async (req: any, res: any) => {
  const { getEnv } = await import("../config/env");
  const { default: axios } = await import("axios");
  const env = getEnv();
  const { provider, capability } = req.query;
  try {
    const params: Record<string, string> = {};
    if (provider) params.provider = provider;
    if (capability) params.capability = capability;

    const result = await axios.get(`${env.PYTHON_API_URL}/api/ai/models`, {
      timeout: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: { "X-Request-Id": req.requestId },
      params,
    });
    res.json(result.data);
  } catch (err: any) {
    if (err.response?.status === 400) {
      res.status(400).json({
        message: err.response?.data?.detail || "Invalid query parameters",
        code: "INVALID_PARAMS",
        request_id: req.requestId,
      });
    } else {
      res.status(502).json({
        message: "AI Core models endpoint unreachable",
        code: "AI_CORE_UNAVAILABLE",
        request_id: req.requestId,
      });
    }
  }
}));

router.post("/financial-profiles/investments", validate({ body: addInvestmentBodySchema }), asyncRoute(addInvestment));

// Financial profile routes
router.get("/financial-profiles/me", asyncRoute(getFinancialProfile));
router.put("/financial-profiles/me", validate({ body: updateFinancialProfileBodySchema }), asyncRoute(updateFinancialProfile));

// Deprecated aliases (kept temporarily for backward compatibility)
router.get("/financial-profiles/:userId", validate({ params: userIdParamSchema }), asyncRoute(getFinancialProfile));
router.put(
  "/financial-profiles/:userId",
  validate({ params: userIdParamSchema, body: updateFinancialProfileBodySchema }),
  asyncRoute(updateFinancialProfile)
);

// Agent outputs
router.get("/agent-outputs/recent", validate({ query: recentAgentOutputsQuerySchema }), asyncRoute(getRecentAgentOutputs));
router.get("/agent-outputs/:id", validate({ params: objectIdSchema }), asyncRoute(getAgentOutputById));
router.post(
  "/agent-outputs/:id/feedback",
  validate({ params: objectIdSchema, body: agentOutputFeedbackBodySchema }),
  asyncRoute(submitAgentOutputFeedback)
);
router.get("/agent-outputs/user/:userId", validate({ params: userIdParamSchema }), asyncRoute(getAgentOutputs));

export default router;
