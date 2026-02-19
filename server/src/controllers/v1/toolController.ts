import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import type { ToolCallInput } from "../../schemas/v1/toolSchemas";
import { executeToolCall, simulateToolCall } from "../../services/toolExecutor";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const requireOrgRole = (req: Request) => {
  const role = String((req as any).org?.role || "member") as "member" | "admin" | "owner";
  if (role !== "member" && role !== "admin" && role !== "owner") {
    return "member" as const;
  }
  return role;
};

export const simulateTool = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const actorRole = requireOrgRole(req);
  const body = req.body as { tool_call: ToolCallInput };

  const result = await simulateToolCall({
    orgId,
    userId: user._id,
    actorRole,
    toolCall: body.tool_call,
    requestId: req.requestId,
  });

  return res.json(result);
};

export const executeTool = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const actorRole = requireOrgRole(req);
  const body = req.body as { tool_call: ToolCallInput; confirm?: boolean; idempotency_key?: string };

  const result = await executeToolCall({
    orgId,
    userId: user._id,
    actorRole,
    toolCall: body.tool_call,
    requestId: req.requestId,
    idempotencyKey: body.idempotency_key,
    confirmed: body.confirm ?? true,
  });

  return res.json(result);
};

