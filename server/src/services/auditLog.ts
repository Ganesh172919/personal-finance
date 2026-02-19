import mongoose from "mongoose";

import AuditEventModel, { type AuditActorType } from "../models/auditEventModel";

export const recordAuditEvent = async (params: {
  orgId: mongoose.Types.ObjectId;
  actorType: AuditActorType;
  actorUserId?: mongoose.Types.ObjectId;
  actorApiKeyId?: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const doc = await AuditEventModel.create({
      orgId: params.orgId,
      actorType: params.actorType,
      actorUserId: params.actorUserId,
      actorApiKeyId: params.actorApiKeyId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      requestId: params.requestId,
      metadata: params.metadata || {},
    });
    return doc.toObject();
  } catch {
    return null;
  }
};

