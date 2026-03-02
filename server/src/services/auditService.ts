/**
 * Security Audit Service
 *
 * Fire-and-forget audit logging. All methods are non-blocking
 * and will never throw — audit failures must not break business logic.
 */

import type { Request } from "express";
import mongoose from "mongoose";
import AuditLogModel, { type AuditAction, type AuditSeverity } from "../models/auditLogModel";
import { logger } from "../config/logger";

export interface AuditEntry {
  action: AuditAction;
  severity?: AuditSeverity;
  orgId?: string | mongoose.Types.ObjectId;
  userId?: string | mongoose.Types.ObjectId;
  ip?: string;
  userAgent?: string;
  targetResource?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Log a security audit event. Non-blocking, never throws.
 */
export function audit(entry: AuditEntry): void {
  const severityMap: Record<string, AuditSeverity> = {
    login_failed: "warn",
    account_locked: "critical",
    "2fa_failed": "warn",
    plugin_permission_denied: "warn",
    suspicious_activity: "critical",
    data_deleted: "warn",
    password_change: "warn",
    api_key_revoked: "warn",
  };

  const severity = entry.severity || severityMap[entry.action] || "info";

  const doc = {
    action: entry.action,
    severity,
    orgId: entry.orgId ? toObjectId(entry.orgId) : undefined,
    userId: entry.userId ? toObjectId(entry.userId) : undefined,
    ip: entry.ip,
    userAgent: entry.userAgent?.substring(0, 500),
    targetResource: entry.targetResource,
    targetId: entry.targetId,
    metadata: entry.metadata,
    requestId: entry.requestId,
  };

  // Fire-and-forget insert
  AuditLogModel.create(doc).catch((err) => {
    logger.error("Audit log write failed: action=%s error=%s", entry.action, err?.message);
  });
}

/**
 * Convenience: audit from an Express request context.
 */
export function auditFromRequest(
  req: Request,
  action: AuditAction,
  extra: Partial<AuditEntry> = {},
): void {
  const user = (req as any).user;
  const org = (req as any).org;

  audit({
    action,
    userId: extra.userId || user?._id || user?.id,
    orgId: extra.orgId || org?.orgId,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("User-Agent"),
    requestId: req.requestId,
    ...extra,
  });
}

/**
 * Query audit logs for a user (for account activity page).
 */
export async function getUserAuditLog(
  userId: string | mongoose.Types.ObjectId,
  options: { limit?: number; before?: Date; actions?: AuditAction[] } = {},
) {
  const query: Record<string, unknown> = {
    userId: toObjectId(userId),
  };

  if (options.before) {
    query.createdAt = { $lt: options.before };
  }
  if (options.actions && options.actions.length > 0) {
    query.action = { $in: options.actions };
  }

  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .lean();
}

/**
 * Query org-level audit logs (for admin dashboard).
 */
export async function getOrgAuditLog(
  orgId: string | mongoose.Types.ObjectId,
  options: { limit?: number; severity?: AuditSeverity; before?: Date } = {},
) {
  const query: Record<string, unknown> = {
    orgId: toObjectId(orgId),
  };

  if (options.severity) {
    query.severity = options.severity;
  }
  if (options.before) {
    query.createdAt = { $lt: options.before };
  }

  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .lean();
}

/**
 * Count critical events in the last N hours (for alerting).
 */
export async function countRecentCriticalEvents(hours: number = 1): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return AuditLogModel.countDocuments({
    severity: "critical",
    createdAt: { $gte: since },
  });
}

// ─── Helpers ─────────────────────────────────────────────

function toObjectId(value: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId | undefined {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return undefined;
}
