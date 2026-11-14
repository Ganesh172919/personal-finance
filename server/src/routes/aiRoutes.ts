/**
 * @fileoverview AI and financial profile routes for processing natural-language commands,
 * what-if scenarios, financial profiles, agent outputs, and AI Core proxy endpoints.
 *
 * Endpoints:
 *   POST   /process-command                        - Process an AI command (natural language)
 *   POST   /ai/process/stream                      - Stream AI command processing (SSE)
 *   POST   /scenarios/what-if                      - Run a what-if financial scenario
 *   GET    /ai-core/status                         - Get AI Core service status
 *   GET    /ai-core/providers                      - List available AI providers (proxied)
 *   GET    /ai-core/ai/status                      - Enhanced AI status (proxied)
 *   GET    /ai-core/ai/sessions                    - List AI sessions (proxied)
 *   GET    /ai-core/ai/sessions/:sessionId         - Get AI session detail (proxied)
 *   POST   /ai-core/ai/sessions/:sessionId/resume  - Resume an AI session (proxied)
 *   GET    /ai-core/ai/models                      - List available AI models (proxied)
 *   POST   /financial-profiles/investments         - Add an investment to user's profile
 *   GET    /financial-profiles/me                  - Get current user's financial profile
 *   PUT    /financial-profiles/me                  - Update current user's financial profile
 *   GET    /financial-profiles/:userId             - [Deprecated] Get financial profile by user ID
 *   PUT    /financial-profiles/:userId             - [Deprecated] Update financial profile by user ID
 *   GET    /agent-outputs/recent                   - List recent agent outputs
 *   GET    /agent-outputs/:id                      - Get a single agent output by ID
 *   POST   /agent-outputs/:id/feedback             - Submit feedback (thumbs up/down) on an agent output
 *   GET    /agent-outputs/user/:userId             - List agent outputs for a specific user
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Zod validation (aiSchemas, common) on params, query, and body
 *
 * Controllers: aiController, aiStatusController
 * Note: Several /ai-core/* endpoints proxy requests to an external Python AI Core service.
 */
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
import {
  getCanaryStatusHandler,
  validateCanaryInvariantsHandler,
  runCanaryProbesHandler,
} from "../controllers/v1/aiCanaryController";
import { validate } from "../middleware/validate";
import {
  addInvestmentBodySchema,
  agentOutputFeedbackBodySchema,
  getFinancialProfileQuerySchema,
  processCommandBodySchema,
  recentAgentOutputsQuerySchema,
  updateFinancialProfileBodySchema,
  whatIfScenarioBodySchema
} from "../schemas/aiSchemas";
import {
  canaryValidateBodySchema,
  canaryRunProbesBodySchema,
} from "../schemas/v1/aiCanarySchemas";
import { objectIdSchema, userIdParamSchema } from "../schemas/common";
import { asyncRoute } from "../utils/asyncRoute";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import type { IUserDocument } from "../models/userModel";
import { aiCoreHeaders } from "../services/aiCoreTransport";
import { idempotency } from "../middleware/idempotency";
import { aiCoreRequest, isAiCoreOverloadedError, processAiCoreNewsletter } from "../services/aiCoreClient";
import { isAiCapacityError } from "../services/aiConcurrency";
import aiLearningRoutes from "./aiLearningRoutes";

// Initializes Express router instance for core AI and financial profile routes.
// Serves natural language command parsing, scenario planning, and AI Core proxies.
// Mounts route handlers protected by JWT authentication and Zod schemas.
const router = Router();

// Extracts and validates organization and user context required for AI Core calls.
// Ensures active tenant isolation and prevents cross-organization context leakage.
// Throws 403 Forbidden HttpError if organization context or user ID is missing.
const getAiCoreActor = (req: any) => {
  const user = req.user as IUserDocument | undefined;
  const orgId = String(req.org?.orgId || "").trim();
  const userId = user?._id?.toString();
  if (!orgId || !userId) {
    throw new HttpError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required for AI sessions");
  }
  return { orgId, userId };
};

// All routes require authentication
// Enforces mandatory JWT authentication on all incoming AI processing endpoints.
// Verifies bearer token signature and binds user and organization identity.
// Rejects unauthenticated requests with 401 Unauthorized status responses.
router.use(passport.authenticate("jwt", { session: false }));

// AI learning loop: feedback review queue + AI Core registry proxy (admin). Before /agent-outputs/:id.
// Mounts AI learning loop sub-routes for feedback review queues and model registry.
// Integrates continuous training signal capture and active model evaluation.
// Placed before agent output endpoints to ensure correct routing precedence.
router.use("/", aiLearningRoutes);

// AI processing routes
// `idempotency()` is opt-in per request (Idempotency-Key header): a retried AI call replays the
// stored response instead of re-running the work and billing again. Streams cannot be replayed,
// so a duplicate key is refused instead.
// Dispatches natural language user queries to AI agents for financial synthesis.
// Supports opt-in request idempotency replaying cached output without re-billing.
// Validates command payload and hands execution to processAICommand controller.
router.post("/process-command", idempotency(), validate({ body: processCommandBodySchema }), asyncRoute(processAICommand));

// Streams real-time AI reasoning tokens and tool invocations via server-sent events.
// Enforces streaming idempotency validation preventing concurrent duplicate runs.
// Invokes processAiStream controller maintaining persistent chunked connection.
router.post(
  "/ai/process/stream",
  idempotency({ streaming: true }),
  validate({ body: processCommandBodySchema }),
  asyncRoute(processAiStream)
);

// Models hypothetical financial adjustments and calculates forward cash projections.
// Validates scenario parameter schemas including income shifts and budget changes.
// Dispatches simulation modeling to processWhatIfScenario controller handler.
router.post("/scenarios/what-if", idempotency(), validate({ body: whatIfScenarioBodySchema }), asyncRoute(processWhatIfScenario));

// Queries operational readiness and health telemetry of local AI subsystems.
// Inspects active workers, queue latencies, and circuit breaker health statuses.
// Invokes getAiCoreStatus controller returning diagnostic status metrics.
router.get("/ai-core/status", asyncRoute(getAiCoreStatus));

// Proxies query to Python AI Core service retrieving available LLM providers.
// Applies request timeouts and translates downstream service connection failures.
// Returns JSON list of operational model providers and capability attributes.
router.get("/ai-core/providers", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  try {
    const result = await aiCoreRequest({
      method: "get",
      path: `/api/providers`,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId }),
    });
    res.json({ ...result.data, request_id: req.requestId });
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
    res.status(502).json({
      message: "AI Core providers endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// Enhanced AI status endpoint - proxies to AI Core /api/ai/status
// Proxies enhanced system status requests to Python AI Core service endpoint.
// Forwards active request ID and tenant headers while monitoring gateway latency.
// Returns comprehensive worker queue metrics and provider operational data.
router.get("/ai-core/ai/status", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  try {
    const result = await aiCoreRequest({
      method: "get",
      path: `/api/ai/status`,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId }),
    });
    res.json(result.data);
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
    res.status(502).json({
      message: "AI Core enhanced status endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// AI sessions list endpoint
// Lists active and historical AI agent execution sessions from AI Core backend.
// Validates requesting actor credentials and enforces tenant-scoped isolation.
// Proxies query to AI Core /api/ai/sessions returning paginated session records.
router.get("/ai-core/ai/sessions", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  const actor = getAiCoreActor(req);
  const { limit } = req.query;
  try {
    const params: Record<string, string> = {};
    params.org_id = actor.orgId;
    params.user_id = actor.userId;
    if (limit) params.limit = String(limit);

    const result = await aiCoreRequest({
      method: "get",
      path: `/api/ai/sessions`,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId, actor }),
      params,
    });
    res.json(result.data);
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
    res.status(502).json({
      message: "AI Core sessions endpoint unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
  }
}));

// AI session detail endpoint
// Retrieves detailed execution transcript and state for a specific AI session.
// Validates caller authorization and passes session identifier to AI Core proxy.
// Returns full step breakdown, tool outputs, and intermediate thought traces.
router.get("/ai-core/ai/sessions/:sessionId", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  const actor = getAiCoreActor(req);
  const { sessionId } = req.params;
  try {
    const result = await aiCoreRequest({
      method: "get",
      path: `/api/ai/sessions/${sessionId}`,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId, actor }),
    });
    res.json(result.data);
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
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
// Resumes a paused or human-in-the-loop blocked AI session in the Python backend.
// Forwards user input, confirms actor context, and restarts agent execution loop.
// Returns updated session execution status and downstream task progress.
router.post("/ai-core/ai/sessions/:sessionId/resume", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  const actor = getAiCoreActor(req);
  const { sessionId } = req.params;
  try {
    const result = await aiCoreRequest({
      method: "post",
      path: `/api/ai/sessions/${sessionId}/resume`,
      data: {},
      idempotent: false,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId, actor }),
    });
    res.json(result.data);
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
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
// Queries available model registry entries matching provider or capability filters.
// Validates query parameters and forwards lookup request to AI Core service.
// Returns array of registered models, context lengths, and parameter weights.
router.get("/ai-core/ai/models", asyncRoute(async (req: any, res: any) => {
  const env = getEnv();
  const { provider, capability } = req.query;
  try {
    const params: Record<string, string> = {};
    if (provider) params.provider = provider;
    if (capability) params.capability = capability;

    const result = await aiCoreRequest({
      method: "get",
      path: `/api/ai/models`,
      timeoutMs: env.AI_CORE_STATUS_TIMEOUT_MS,
      headers: aiCoreHeaders({ requestId: req.requestId }),
      params,
    });
    res.json(result.data);
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
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

// Number safety & continuous production canary validation endpoints
// Checks continuous production canary status evaluating numeric safety in AI outputs.
// Monitors precision accuracy and detects potential calculation hallucination drift.
// Invokes getCanaryStatusHandler controller returning validation metrics.
router.get("/ai-core/canary/number-safety", asyncRoute(getCanaryStatusHandler));

// Evaluates calculation invariant assertions against generated financial statements.
// Validates mathematical consistency body payload using canaryValidateBodySchema.
// Hands assertion verification over to validateCanaryInvariantsHandler controller.
router.post("/ai-core/canary/validate", validate({ body: canaryValidateBodySchema }), asyncRoute(validateCanaryInvariantsHandler));

// Triggers active execution of numeric precision canary probes against models.
// Validates probe suite execution schema and dispatches test scenarios.
// Invokes runCanaryProbesHandler controller returning test outcome diagnostics.
router.post("/ai-core/canary/run-probes", validate({ body: canaryRunProbesBodySchema }), asyncRoute(runCanaryProbesHandler));

// Adds a new investment holding or asset allocation to the user financial profile.
// Validates asset ticker, quantity, cost basis, and purchase date body fields.
// Calls addInvestment controller handler to persist investment record.
router.post("/financial-profiles/investments", validate({ body: addInvestmentBodySchema }), asyncRoute(addInvestment));

// Financial profile routes
// Retrieves current user comprehensive financial risk tolerance and asset profile.
// Enforces authenticated JWT context and validates profile query options.
// Invokes getFinancialProfile controller returning synthesized financial profile.
router.get("/financial-profiles/me", validate({ query: getFinancialProfileQuerySchema }), asyncRoute(getFinancialProfile));

// Updates financial profile configuration including income streams and risk metrics.
// Validates payload body schema against updateFinancialProfileBodySchema constraints.
// Commits profile modifications through updateFinancialProfile controller logic.
router.put("/financial-profiles/me", validate({ body: updateFinancialProfileBodySchema }), asyncRoute(updateFinancialProfile));

// Deprecated aliases (kept temporarily for backward compatibility)
// Deprecated endpoint retrieving financial profile by explicit user ID parameter.
// Validates userId route parameter and confirms administrative or user access.
// Delegates profile fetching to getFinancialProfile controller handler.
router.get("/financial-profiles/:userId", validate({ params: userIdParamSchema, query: getFinancialProfileQuerySchema }), asyncRoute(getFinancialProfile));

// Deprecated endpoint updating financial profile for a specific user ID parameter.
// Validates target userId parameter along with updateFinancialProfileBodySchema.
// Commits user profile updates through updateFinancialProfile controller.
router.put(
  "/financial-profiles/:userId",
  validate({ params: userIdParamSchema, body: updateFinancialProfileBodySchema }),
  asyncRoute(updateFinancialProfile)
);

// Agent outputs
// Lists recent AI agent generated outputs, recommendations, and plans.
// Validates query parameters determining timeframe and output categorization.
// Invokes getRecentAgentOutputs controller returning structured artifact list.
router.get("/agent-outputs/recent", validate({ query: recentAgentOutputsQuerySchema }), asyncRoute(getRecentAgentOutputs));

// Retrieves an individual agent generated output artifact by unique ID.
// Validates objectId route parameter and confirms user ownership rights.
// Calls getAgentOutputById controller returning artifact payload details.
router.get("/agent-outputs/:id", validate({ params: objectIdSchema }), asyncRoute(getAgentOutputById));

// Records qualitative user feedback and accuracy ratings on agent recommendations.
// Validates target artifact objectId and agentOutputFeedbackBodySchema ratings.
// Commits feedback to training loop via submitAgentOutputFeedback controller.
router.post(
  "/agent-outputs/:id/feedback",
  validate({ params: objectIdSchema, body: agentOutputFeedbackBodySchema }),
  asyncRoute(submitAgentOutputFeedback)
);

// Queries historical agent outputs generated for a specific user account.
// Validates userId parameter and ensures caller possesses required permissions.
// Dispatches query to getAgentOutputs controller returning output records.
router.get("/agent-outputs/user/:userId", validate({ params: userIdParamSchema }), asyncRoute(getAgentOutputs));

// Newsletter AI Core proxy endpoint
// Proxies newsletter synthesis and market digest generation to AI Core service.
// Passes request payload and priority routing context to Python background worker.
// Returns generated financial newsletter content and contextual article references.
router.post("/ai-core/newsletter", asyncRoute(async (req: any, res: any) => {
  try {
    const result = await processAiCoreNewsletter(req.body, {
      requestId: req.requestId,
      userId: (req.user as IUserDocument | undefined)?._id?.toString(),
      priority: "batch",
    });
    res.json({ ...result.data, request_id: req.requestId });
  } catch (err: any) {
    if (isAiCoreOverloadedError(err) || isAiCapacityError(err)) throw err; // 503 + Retry-After via the error handler
    if (err.response?.status === 422) {
      res.status(400).json({
        message: err.response?.data?.detail || "Invalid request body",
        code: "INVALID_REQUEST",
        request_id: req.requestId,
      });
    } else {
      res.status(502).json({
        message: "AI Core newsletter endpoint unreachable",
        code: "AI_CORE_UNAVAILABLE",
        request_id: req.requestId,
      });
    }
  }
}));

// Exports configured AI processing router instance as module default export.
// Mounts into main server application providing natural language and profile routes.
// Exposes complete REST interface for AI assistant capabilities and scenarios.
export default router;
