import { Schema, model, Document, Types } from "mongoose";

export type AuditActorType = "user" | "system" | "api_key";

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

export interface IAuditEventDocument extends Omit<IAuditEvent, "createdAt" | "updatedAt">, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

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

auditEventSchema.index({ orgId: 1, createdAt: -1 });
auditEventSchema.index({ orgId: 1, actorUserId: 1, createdAt: -1 });
auditEventSchema.index({ orgId: 1, action: 1, createdAt: -1 });

const AuditEventModel = model<IAuditEventDocument>("AuditEvent", auditEventSchema);
export default AuditEventModel;

