import type { Request, Response } from "express";
import mongoose from "mongoose";

import AuditEventModel from "../../models/auditEventModel";
import { HttpError } from "../../middleware/httpError";

const requireOrgContext = (req: Request) => {
  const org = (req as any).org;
  const orgIdRaw = String(org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }

  const role = String(org?.role || "");
  if (role !== "owner" && role !== "admin") {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }

  return { orgId: new mongoose.Types.ObjectId(orgIdRaw), role };
};

export const listAuditEvents = async (req: Request, res: Response) => {
  const { orgId } = requireOrgContext(req);

  const limitRaw = (req.query as any)?.limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Math.min(Math.max(1, Number(limitRaw)), 200) : 50;

  const actionRaw = typeof (req.query as any)?.action === "string" ? String((req.query as any).action).trim() : "";
  const action = actionRaw ? actionRaw.slice(0, 80) : undefined;

  const match: Record<string, unknown> = { orgId };
  if (action) {
    match.action = action;
  }

  const events = await AuditEventModel.find(match)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({
    events: events.map((event: any) => ({
      id: String(event._id),
      actor_type: String(event.actorType),
      actor_user_id: event.actorUserId ? String(event.actorUserId) : undefined,
      actor_api_key_id: event.actorApiKeyId ? String(event.actorApiKeyId) : undefined,
      action: String(event.action),
      target_type: String(event.targetType),
      target_id: event.targetId ? String(event.targetId) : undefined,
      request_id: event.requestId ? String(event.requestId) : undefined,
      metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
      created_at: event.createdAt ? new Date(event.createdAt).toISOString() : undefined,
    })),
    request_id: req.requestId,
  });
};

