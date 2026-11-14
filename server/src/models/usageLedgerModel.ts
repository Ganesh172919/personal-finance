import { Schema, model, Document, Types } from "mongoose";

import { USAGE_FEATURES, type UsageFeature } from "./usageEventModel";

// Defines domain attributes for aggregated organization usage balances per billing period.
// Stores consolidated units, cumulative token counts, and dollar costs per feature key.
// Serves as the high-performance summarized balance ledger for quota limit enforcement.
export interface IUsageLedger {
  orgId: Types.ObjectId;
  periodKey: string;
  feature: UsageFeature;
  units: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Merges usage ledger domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent usage ledger document returned by quota check queries.
export interface IUsageLedgerDocument extends IUsageLedger, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the aggregated usage ledger collection.
// Enforces validation rules on organization IDs, period keys, and non-negative units.
// Automatically manages document creation and modification timestamps on ledger updates.
const usageLedgerSchema = new Schema<IUsageLedgerDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    periodKey: { type: String, required: true, trim: true, maxlength: 16, index: true },
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
  },
  { timestamps: true }
);

// Configures compound database indexes for atomic usage increments and balance checks.
// Enforces a strict unique index across organization, period, and feature to prevent duplicates.
// Optimizes period-level audit queries and billing summary exports.
usageLedgerSchema.index({ orgId: 1, periodKey: 1, feature: 1 }, { unique: true });
usageLedgerSchema.index({ orgId: 1, periodKey: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for aggregated feature usage ledger balances.
// Exposes atomic increment and query methods to enforce real-time subscription limits.
// Acts as the authoritative fast-path data store for plan entitlement validation.
const UsageLedgerModel = model<IUsageLedgerDocument>("UsageLedger", usageLedgerSchema);
export default UsageLedgerModel;
