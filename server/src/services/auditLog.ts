import mongoose from "mongoose";

import AuditEventModel, { type AuditActorType } from "../models/auditEventModel";

// Records an immutable audit event for security and compliance tracking.
// Persists the actor identity, action type, affected resource, and metadata.
// Returns the saved audit record object or null if persistence encounters an error.
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

