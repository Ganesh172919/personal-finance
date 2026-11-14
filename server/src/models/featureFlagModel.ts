import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript contract representing a dynamic system feature flag.
// Controls runtime feature gating, percentage rollouts, and multivariate testing.
// Scoped per organization to allow tenant-specific experimentation and toggles.
export interface IFeatureFlag {
  orgId: Types.ObjectId;
  key: string;
  enabled: boolean;
  variant?: string;
  rolloutPercent: number;
  metadata?: Record<string, unknown>;
  updatedByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IFeatureFlag with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual feature flag documents inside MongoDB storage collection.
export interface IFeatureFlagDocument extends IFeatureFlag, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing dynamic feature flag records.
// Enforces unique key indexing per organization and percentage boundaries.
// Automatically tracks createdAt and updatedAt timestamps for configuration audits.
const featureFlagSchema = new Schema<IFeatureFlagDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    enabled: { type: Boolean, required: true, default: false },
    variant: { type: String, trim: true, maxlength: 80 },
    rolloutPercent: { type: Number, required: true, min: 0, max: 100, default: 100 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true }
);

// Compound indexes ensuring flag key uniqueness and fast runtime evaluations.
// Enforces unique constraint preventing duplicate keys within an organization.
// Accelerates queries retrieving enabled flags during request routing evaluation.
featureFlagSchema.index({ orgId: 1, key: 1 }, { unique: true });
featureFlagSchema.index({ orgId: 1, enabled: 1, key: 1 });

// Instantiates Mongoose model bound to MongoDB "FeatureFlag" collection.
// Provides strongly typed querying, upserting, and feature evaluation logic.
// Consumed by feature flag controllers, client hydration routes, and middleware.
const FeatureFlagModel = model<IFeatureFlagDocument>("FeatureFlag", featureFlagSchema);
// Exports compiled FeatureFlagModel instance as default module export.
// Imported by feature toggle utilities, configuration endpoints, and admin APIs.
// Serves as central database access gateway for dynamic application feature flags.
export default FeatureFlagModel;
