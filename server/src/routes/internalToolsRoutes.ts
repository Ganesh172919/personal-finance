/**
 * @fileoverview Internal tool execution routes used by the AI Core service to simulate
 * and execute tool calls on behalf of users. These endpoints are NOT part of the public
 * API and are protected by a shared bearer token (AI_CORE_TOOLS_TOKEN).
 *
 * Endpoints:
 *   GET    /catalog     - List all available tool definitions in the catalog
 *   POST   /simulate    - Simulate a tool call without side effects (dry-run)
 *   POST   /execute     - Execute a tool call with real side effects
 *
 * Middleware:
 *   - Custom bearer-token authentication (internalToolsAuth) using AI_CORE_TOOLS_TOKEN
 *   - Zod validation (toolSchemas) on request body
 *
 * Controllers: Inlined handlers that delegate to toolExecutor and orgService
 */
import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { internalToolsBodySchema, type ToolCallInput } from "../schemas/v1/toolSchemas";
import { resolveOrgForRequest } from "../services/orgService";
import { executeToolCall, simulateToolCall } from "../services/toolExecutor";
import { listToolCatalog } from "../services/tools/registry";

// Enforces pre-shared bearer token authorization for private AI Core service-to-service endpoints.
// Verifies incoming Bearer authorization headers against the configured AI_CORE_TOOLS_TOKEN secret.
// Rejects unauthorized access with 403 Forbidden or 404 if internal tooling is unconfigured.
const internalToolsAuth: RequestHandler = (req, res, next) => {
  const env = getEnv();
  if (!env.AI_CORE_TOOLS_TOKEN) {
    res.status(404).json({ message: "Not found", code: "NOT_FOUND", request_id: req.requestId });
    return;
  }

  const header = String(req.header("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token || token !== env.AI_CORE_TOOLS_TOKEN) {
    res.status(403).json({ message: "Forbidden", code: "FORBIDDEN", request_id: req.requestId });
    return;
  }

  next();
};

// Initializes an Express router dedicated to internal machine-to-machine AI tool invocation.
// Segregates automated tool dry-runs and privileged mutation execution from public HTTP routes.
// Exposes service interfaces consumed by external Python AI Core subagents.
const router = Router();

// Returns the registered catalog of executable tools available to AI Core reasoning agents.
// Gated by internalToolsAuth middleware to restrict catalog schema discovery to authenticated services.
// Serializes tool definitions, input schemas, and permission requirements into a JSON response.
router.get(
  "/catalog",
  internalToolsAuth,
  asyncRoute(async (req, res) => {
    res.json({
      tools: listToolCatalog(),
      request_id: req.requestId,
    });
  })
);

// Simulates an automated tool execution dry-run without producing persistent database side effects.
// Resolves tenant membership permissions for the target user before evaluating execution safety.
// Returns predicted mutation effects, policy approvals, and validation outcomes to the caller.
router.post(
  "/simulate",
  internalToolsAuth,
  validate({ body: internalToolsBodySchema }),
  asyncRoute(async (req, res) => {
    const body = req.body as {
      org_id: string;
      user_id: string;
      tool_call: ToolCallInput;
    };

    const userId = new mongoose.Types.ObjectId(body.user_id);
    const membership = await resolveOrgForRequest({ userId, requestedOrgId: body.org_id });

    const result = await simulateToolCall({
      orgId: membership.orgId,
      userId,
      actorRole: membership.role,
      toolCall: body.tool_call,
      requestId: req.requestId,
    });

    res.json(result);
  })
);

// Executes a live tool call with persistent database mutations and audit ledger logging.
// Validates tenant membership roles, confirmation status, and optional idempotency keys.
// Invokes executeToolCall to perform business actions and returns the structured result payload.
router.post(
  "/execute",
  internalToolsAuth,
  validate({ body: internalToolsBodySchema }),
  asyncRoute(async (req, res) => {
    const body = req.body as {
      org_id: string;
      user_id: string;
      tool_call: ToolCallInput;
      confirm?: boolean;
      idempotency_key?: string;
    };

    const userId = new mongoose.Types.ObjectId(body.user_id);
    const membership = await resolveOrgForRequest({ userId, requestedOrgId: body.org_id });

    const result = await executeToolCall({
      orgId: membership.orgId,
      userId,
      actorRole: membership.role,
      toolCall: body.tool_call,
      requestId: req.requestId,
      confirmed: body.confirm ?? true,
      idempotencyKey: body.idempotency_key,
    });

    res.json(result);
  })
);

export default router;
