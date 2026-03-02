/**
 * Security Audit Log Model
 *
 * Immutable, append-only log of security-relevant events.
 * Used for compliance, incident investigation, and anomaly detection.
 */

import { Schema, model, Document, Types } from "mongoose";

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "password_change"
  | "password_reset_request"
  | "password_reset_complete"
  | "2fa_enabled"
  | "2fa_disabled"
  | "2fa_verified"
  | "2fa_failed"
  | "2fa_backup_used"
  | "api_key_created"
  | "api_key_revoked"
  | "account_locked"
  | "account_unlocked"
  | "profile_updated"
  | "role_changed"
  | "org_member_added"
  | "org_member_removed"
  | "plugin_installed"
  | "plugin_uninstalled"
  | "plugin_permission_denied"
  | "export_created"
  | "data_deleted"
  | "session_invalidated"
  | "suspicious_activity";

export type AuditSeverity = "info" | "warn" | "critical";

export interface IAuditLog {
  orgId?: Types.ObjectId;
  userId?: Types.ObjectId;
  action: AuditAction;
  severity: AuditSeverity;
  ip?: string;
  userAgent?: string;
  targetResource?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {
  _id: Types.ObjectId;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    action: {
      type: String,
      required: true,
      index: true,
      enum: [
        "login_success", "login_failed", "logout",
        "password_change", "password_reset_request", "password_reset_complete",
        "2fa_enabled", "2fa_disabled", "2fa_verified", "2fa_failed", "2fa_backup_used",
        "api_key_created", "api_key_revoked",
        "account_locked", "account_unlocked",
        "profile_updated", "role_changed",
        "org_member_added", "org_member_removed",
        "plugin_installed", "plugin_uninstalled", "plugin_permission_denied",
        "export_created", "data_deleted",
        "session_invalidated", "suspicious_activity",
      ],
    },
    severity: {
      type: String,
      required: true,
      enum: ["info", "warn", "critical"],
      default: "info",
      index: true,
    },
    ip: { type: String, trim: true, maxlength: 45 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    targetResource: { type: String, trim: true, maxlength: 120 },
    targetId: { type: String, trim: true, maxlength: 120 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String, trim: true, maxlength: 64 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Immutable: prevent updates/deletes at schema level
    strict: true,
  },
);

// TTL index: auto-delete after 365 days (configurable)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ orgId: 1, severity: 1, createdAt: -1 });

const AuditLogModel = model<IAuditLogDocument>("AuditLog", auditLogSchema);
export default AuditLogModel;
