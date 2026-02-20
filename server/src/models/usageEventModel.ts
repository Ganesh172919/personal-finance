import { Schema, model, Document, Types } from "mongoose";

export const USAGE_FEATURES = [
  "monthly_ai_calls",
  "scenario_depth",
  "ocr_quota",
  "export_access",
  "api_requests",
  "autopilot_actions",
  "workflow_runs",
  "connector_sync_records",
  "marketplace_installs",
] as const;

export type UsageFeature = (typeof USAGE_FEATURES)[number];

export interface IUsageEvent {
  orgId?: Types.ObjectId;
  userId: Types.ObjectId;
  feature: UsageFeature;
  units: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  modelName?: string;
  periodKey: string;
  requestId?: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUsageEventDocument extends IUsageEvent, Document {
  _id: Types.ObjectId;
}

const usageEventSchema = new Schema<IUsageEventDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: false, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    feature: {
      type: String,
      enum: [...USAGE_FEATURES],
      required: true,
      index: true,
    },
    units: { type: Number, required: true, min: 0 },
    tokensIn: { type: Number, min: 0 },
    tokensOut: { type: Number, min: 0 },
    costUsd: { type: Number, min: 0 },
    modelName: { type: String, trim: true, maxlength: 80 },
    periodKey: { type: String, required: true, trim: true, maxlength: 16, index: true },
    requestId: { type: String, trim: true, maxlength: 128 },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    context: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

usageEventSchema.index({ userId: 1, feature: 1, periodKey: 1, createdAt: -1 });
usageEventSchema.index({ orgId: 1, feature: 1, periodKey: 1, createdAt: -1 });
usageEventSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

const UsageEventModel = model<IUsageEventDocument>("UsageEvent", usageEventSchema);
export default UsageEventModel;
