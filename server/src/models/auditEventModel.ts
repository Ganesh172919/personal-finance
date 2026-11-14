import { Schema, model, Document, Types } from "mongoose";

// Enumerates initiating entity types responsible for triggering audit events.
// Categorizes actions triggered by human users, automated background jobs, or API keys.
// Provides structured origin classification across system-wide security audit trails.
export type AuditActorType = "user" | "system" | "api_key";

// Defines TypeScript interface for immutable security and compliance audit records.
// Tracks initiator context, target resource, action type, request ID, and metadata.
// Serves as strongly-typed schema model for recording system operational history.
export interface IAuditEvent {
  orgId: Types.ObjectId;
  actorType: AuditActorType;
  actorUserId?: Types.ObjectId;
  actorApiKeyId?: Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IAuditEvent with Mongoose Document properties and ObjectId identifier.
// Enables runtime database persistence, schema validation, and typed document methods.
// Represents individual audit log documents within MongoDB storage layer.
export interface IAuditEventDocument extends Omit<IAuditEvent, "createdAt" | "updatedAt">, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose schema definition governing audit event document structure and types.
// Enforces required fields, string length boundaries, and actor type enumerations.
// Automatically manages createdAt and updatedAt timestamps for event sequencing.
const auditEventSchema = new Schema<IAuditEventDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    actorType: { type: String, enum: ["user", "system", "api_key"], required: true, default: "user", index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    actorApiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey" },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetId: { type: String, trim: true, maxlength: 120 },
    requestId: { type: String, trim: true, maxlength: 128 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound indexes optimizing security audit trail lookups and compliance reviews.
// Accelerates queries filtered by tenant organization, initiating user, and action type.
// Guarantees fast timeline retrieval across high-volume administrative audit logs.
auditEventSchema.index({ orgId: 1, createdAt: -1 });
auditEventSchema.index({ orgId: 1, actorUserId: 1, createdAt: -1 });
auditEventSchema.index({ orgId: 1, action: 1, createdAt: -1 });

// Instantiates Mongoose model bound to MongoDB "AuditEvent" data collection.
// Provides strongly typed querying and insertion methods for audit events.
// Used across system controllers, middleware, and services to log critical events.
const AuditEventModel = model<IAuditEventDocument>("AuditEvent", auditEventSchema);
// Exports compiled AuditEventModel instance as default module export.
// Imported by audit logging utilities, administrative handlers, and telemetry.
// Provides primary database access interface for recording immutable audit logs.
export default AuditEventModel;
