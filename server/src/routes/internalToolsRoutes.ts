import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { internalToolsBodySchema, type ToolCallInput } from "../schemas/v1/toolSchemas";
import { resolveOrgForRequest } from "../services/orgService";
import { executeToolCall, simulateToolCall } from "../services/toolExecutor";
import { listToolCatalog } from "../services/tools/registry";

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

const router = Router();

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
