import { Schema, model, Document, Types } from "mongoose";

// Enumerates metered platform features subject to credit quota grants.
// Includes AI model inferences, OCR allocations, workflows, and connector records.
// Serves as canonical list for entitlement enforcement and quota calculations.
export const CREDIT_FEATURES = [
  "monthly_ai_calls",
  "scenario_depth",
  "ocr_quota",
  "api_requests",
  "autopilot_actions",
  "workflow_runs",
  "connector_sync_records",
  "marketplace_installs",
] as const;

// Type union representing individual metered platform capability identifiers.
// Derived directly from the CREDIT_FEATURES constant string array.
// Enforces strict typing across credit grant assignments and ledger decrements.
export type CreditFeature = (typeof CREDIT_FEATURES)[number];

// Defines TypeScript contract representing an allotted credit balance grant.
// Stores allocated quota units, billing period, origin source, and idempotency key.
// Prevents duplicate credit allocations during webhook retries or top-ups.
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

// Extends ICreditGrant with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence, and typed document manipulation.
// Represents individual credit grant documents within MongoDB database storage.
export interface ICreditGrantDocument extends ICreditGrant, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing platform credit quota grants.
// Enforces positive unit counts, feature enumerations, and source string limits.
// Automatically manages createdAt and updatedAt timestamps for grant auditing.
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

// Compound and unique partial indexes optimizing quota aggregation and deduplication.
// Accelerates retrieval of active credit grants scoped to organization and feature.
// Enforces strict idempotency on grants with unique idempotencyKey partial index.
creditGrantSchema.index({ orgId: 1, periodKey: 1, feature: 1, createdAt: -1 });
creditGrantSchema.index(
  { orgId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

// Instantiates Mongoose model bound to MongoDB "CreditGrant" collection.
// Provides strongly typed querying, credit allocation, and balance summation.
// Consumed by billing controllers, plan entitlement services, and top-up workers.
const CreditGrantModel = model<ICreditGrantDocument>("CreditGrant", creditGrantSchema);
// Exports compiled CreditGrantModel instance as default module export.
// Imported by credit pack purchase routers, billing services, and usage checkers.
// Serves as central database access gateway for managing platform credit grants.
export default CreditGrantModel;
