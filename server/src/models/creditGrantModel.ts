import { Schema, model, Document, Types } from "mongoose";

export const CREDIT_FEATURES = [
  "monthly_ai_calls",
  "scenario_depth",
  "ocr_quota",
  "api_requests",
  "workflow_runs",
  "connector_sync_records",
  "marketplace_installs",
] as const;

export type CreditFeature = (typeof CREDIT_FEATURES)[number];

export interface ICreditGrant {
  orgId: Types.ObjectId;
  periodKey: string;
  feature: CreditFeature;
  units: number;
  sourceType: string;
  sourceId: string;
  idempotencyKey?: string;
  createdByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreditGrantDocument extends ICreditGrant, Document {
  _id: Types.ObjectId;
}

const creditGrantSchema = new Schema<ICreditGrantDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    periodKey: { type: String, required: true, trim: true, maxlength: 16, index: true },
    feature: { type: String, enum: [...CREDIT_FEATURES], required: true, index: true },
    units: { type: Number, required: true, min: 0 },
    sourceType: { type: String, required: true, trim: true, maxlength: 40 },
    sourceId: { type: String, required: true, trim: true, maxlength: 128 },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

creditGrantSchema.index({ orgId: 1, periodKey: 1, feature: 1, createdAt: -1 });
creditGrantSchema.index(
  { orgId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

const CreditGrantModel = model<ICreditGrantDocument>("CreditGrant", creditGrantSchema);
export default CreditGrantModel;

