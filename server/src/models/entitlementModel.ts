import { Schema, model, Document, Types } from "mongoose";

export type PlanTier = "free" | "pro" | "team" | "enterprise";
export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled";

export interface IEntitlementLimitsOverride {
  monthly_ai_calls?: number;
  scenario_depth?: number;
  ocr_quota?: number;
  export_access?: boolean;
  api_requests?: number;
  workflow_runs?: number;
  connector_sync_records?: number;
  marketplace_installs?: number;
}

export interface IEntitlement {
  orgId?: Types.ObjectId;
  userId: Types.ObjectId;
  plan: PlanTier;
  status: EntitlementStatus;
  limitsOverride?: IEntitlementLimitsOverride;
  billingCustomerId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEntitlementDocument extends IEntitlement, Document {
  _id: Types.ObjectId;
}

const entitlementSchema = new Schema<IEntitlementDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: false },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["free", "pro", "team", "enterprise"], required: true, default: "free" },
    status: {
      type: String,
      enum: ["active", "trialing", "past_due", "canceled"],
      required: true,
      default: "active",
    },
    limitsOverride: {
      monthly_ai_calls: { type: Number, min: 0 },
      scenario_depth: { type: Number, min: 0 },
      ocr_quota: { type: Number, min: 0 },
      export_access: { type: Boolean },
      api_requests: { type: Number, min: 0 },
      workflow_runs: { type: Number, min: 0 },
      connector_sync_records: { type: Number, min: 0 },
      marketplace_installs: { type: Number, min: 0 },
    },
    billingCustomerId: { type: String, trim: true },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

entitlementSchema.index({ plan: 1, status: 1 });
entitlementSchema.index(
  { orgId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      orgId: { $type: "objectId" },
    },
  }
);

const EntitlementModel = model<IEntitlementDocument>("Entitlement", entitlementSchema);
export default EntitlementModel;
