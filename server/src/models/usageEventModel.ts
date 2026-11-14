import { Schema, model, Document, Types } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

// Defines billable metering feature keys and derived union types for platform consumption.
// Enumerates metered capabilities including AI inference, OCR quotas, exports, and workflows.
// Serves as the constant foundation for rate limiting and billing ledger debit calculations.
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

// Defines the domain attributes capturing a discrete metered consumption event.
// Records consumed units, LLM token counts, estimated dollar costs, and execution periods.
// Provides granular audit tracking for pay-per-use and subscription tier quotas.
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

// Merges usage event domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent usage event record returned by telemetry metering queries.
export interface IUsageEventDocument extends IUsageEvent, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the platform usage event collection.
// Enforces validation rules on feature names, non-negative unit counts, and period keys.
// Automatically records document creation and modification timestamps on all writes.
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

// Configures compound database indexes for usage aggregation and idempotency protection.
// Accelerates billing period summary rollups grouped by organization, user, and feature.
// Establishes a partial unique index on idempotency keys to prevent duplicate billing events.
usageEventSchema.index({ userId: 1, feature: 1, periodKey: 1, createdAt: -1 });
usageEventSchema.index({ orgId: 1, createdAt: -1 });
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

// Enforces multi-tenant organizational isolation on all usage metering database queries.
// Prevents cross-tenant consumption leakage by enforcing explicit organization scoping.
// Guarantees strict isolation during high-throughput asynchronous usage writes.
// Tenant guard: unscoped reads/writes throw when ORG_SCOPE_ENFORCE / production (see utils/orgScopePlugin).
usageEventSchema.plugin(orgScopePlugin, { guardWrites: true });

// Compiles and exports the Mongoose model for metered feature usage events.
// Exposes data access methods to log, query, aggregate, and reconcile consumption data.
// Powers billing quota checks, customer usage dashboards, and plan overage calculations.
const UsageEventModel = model<IUsageEventDocument>("UsageEvent", usageEventSchema);
export default UsageEventModel;
