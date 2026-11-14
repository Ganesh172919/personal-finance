import { Schema, model, Document, Types } from "mongoose";

// Enumerates available subscription tiers governing user and tenant access.
// Controls feature allowances across free, pro, team, and enterprise tiers.
// Enforced by authorization guards and entitlement calculation middleware.
export type PlanTier = "free" | "pro" | "team" | "enterprise";
// Represents the billing lifecycle state of an organization entitlement record.
// Distinguishes active and trialing subscriptions from past_due or canceled plans.
// Used by billing middleware to evaluate whether paid features remain accessible.
export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled";

// Defines custom quota limit overrides that supersede standard plan defaults.
// Configures tailored allowances for AI inferences, API calls, and workflows.
// Enables enterprise-specific capacity scaling without modifying base tiers.
export interface IEntitlementLimitsOverride {
  monthly_ai_calls?: number;
  scenario_depth?: number;
  ocr_quota?: number;
  export_access?: boolean;
  api_requests?: number;
  autopilot_actions?: number;
  workflow_runs?: number;
  connector_sync_records?: number;
  marketplace_installs?: number;
}

// Defines TypeScript contract representing an account subscription entitlement.
// Encapsulates assigned plan tier, status, custom limit overrides, and periods.
// Links local authorization policies to external billing provider customer tokens.
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

// Extends IEntitlement with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual entitlement records stored in MongoDB database collection.
export interface IEntitlementDocument extends IEntitlement, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing subscription plan entitlements.
// Enforces plan tier and status enumerations, limit constraints, and user keys.
// Automatically tracks createdAt and updatedAt timestamps for plan lifecycle audits.
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
      autopilot_actions: { type: Number, min: 0 },
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

// Compound and unique partial indexes optimizing entitlement lookups and integrity.
// Accelerates queries filtering subscriptions by plan tier and operational status.
// Enforces unique organization mapping with partialFilterExpression on defined orgIds.
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

// Instantiates Mongoose model bound to MongoDB "Entitlement" collection.
// Provides strongly typed querying, plan assignment, and quota verification methods.
// Consumed by billing controllers, rate limiters, and feature access guards.
const EntitlementModel = model<IEntitlementDocument>("Entitlement", entitlementSchema);
// Exports compiled EntitlementModel instance as default module export.
// Imported by monetization controllers, entitlement services, and auth checkers.
// Serves as central database access gateway for user and tenant subscriptions.
export default EntitlementModel;
