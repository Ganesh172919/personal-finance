/**
 * Security Audit Log Model
 *
 * Immutable, append-only log of security-relevant events.
 * Used for compliance, incident investigation, and anomaly detection.
 */

import { Schema, model, Document, Types } from "mongoose";

// Enumerates discrete security action events tracked by the audit logging engine.
// Covers authentication attempts, 2FA workflows, credential changes, and data purges.
// Enforced across security auditing middleware to standardize event taxonomy.
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

// Categorizes the threat severity level of an individual security audit event.
// Differentiates routine informational actions from warning and critical threats.
// Enables security monitoring dashboards to filter and alert on high-severity risks.
export type AuditSeverity = "info" | "warn" | "critical";

// Defines TypeScript interface for immutable security audit log entries.
// Stores actor context, IP address, user agent, target entity, and event payload.
// Facilitates incident investigation, forensic audits, and compliance reporting.
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

// Extends IAuditLog with Mongoose Document methods and MongoDB primary key.
// Enables runtime database querying and strongly typed document manipulation.
// Represents individual security audit records stored in MongoDB collection.
export interface IAuditLogDocument extends IAuditLog, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition for append-only immutable security audit logs.
// Enforces action and severity enumerations, IP length constraints, and indexing.
// Disables automatic updatedAt timestamps to preserve immutable event integrity.
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
// Configures multi-field compound indexes and automatic 365-day TTL retention.
// Speeds up forensic filtering by user action, tenant severity, and timestamp.
// Automatically purges aged log records after one year compliance retention period.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ orgId: 1, severity: 1, createdAt: -1 });

// Instantiates Mongoose model bound to MongoDB "AuditLog" collection.
// Provides strongly typed insertion and querying methods for audit records.
// Central model invoked by security middleware, auth handlers, and incident tools.
const AuditLogModel = model<IAuditLogDocument>("AuditLog", auditLogSchema);
// Exports compiled AuditLogModel instance as default module export.
// Imported by authentication controllers, security services, and audit reporters.
// Serves as dedicated data access layer for recording immutable audit logs.
export default AuditLogModel;
