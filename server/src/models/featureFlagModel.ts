import { Schema, model, Document, Types } from "mongoose";

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

export interface IFeatureFlagDocument extends IFeatureFlag, Document {
  _id: Types.ObjectId;
}

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

featureFlagSchema.index({ orgId: 1, key: 1 }, { unique: true });
featureFlagSchema.index({ orgId: 1, enabled: 1, key: 1 });

const FeatureFlagModel = model<IFeatureFlagDocument>("FeatureFlag", featureFlagSchema);
export default FeatureFlagModel;
