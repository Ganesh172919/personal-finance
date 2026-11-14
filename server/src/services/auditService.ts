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

// Defines the parameter structure for creating a security audit log entry.
// Contains actor identifiers, network origin details, target resource, and metadata.
// Supports flexible severity overrides while preserving action classifications.
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
// Dispatches an asynchronous audit log event using a non-blocking fire-and-forget pattern.
// Automatically derives event severity from action type when not explicitly supplied.
// Suppresses internal write failures to ensure critical business logic is never interrupted.
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
// Captures security audit records directly from an active Express HTTP request context.
// Automatically extracts user session identifiers, organization ID, and client IP headers.
// Passes normalized request metadata through to the underlying audit dispatch function.
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
// Queries historical audit trail entries associated with a specific user account.
// Supports pagination limiting, timestamp cursor filtering, and action type constraints.
// Returns an array of plain JavaScript audit log documents sorted by recency.
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
// Retrieves organization-scoped security audit log entries for administrative oversight.
// Allows filtering by severity level threshold and historic before-timestamp boundaries.
// Delivers sorted lean audit event documents for administrative dashboard review.
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
// Counts high-severity critical security events occurring within a recent rolling window.
// Evaluates timestamp constraints against audit log records for real-time security alerting.
// Returns total occurrence count to trigger automated incident response mechanisms.
export async function countRecentCriticalEvents(hours: number = 1): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return AuditLogModel.countDocuments({
    severity: "critical",
    createdAt: { $gte: since },
  });
}

// ─── Helpers ─────────────────────────────────────────────

// Safely converts arbitrary string identifiers into valid MongoDB ObjectId instances.
// Preserves existing ObjectId references without redundant re-instantiation.
// Returns undefined if the provided identifier string is malformed or invalid.
function toObjectId(value: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId | undefined {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return undefined;
}
