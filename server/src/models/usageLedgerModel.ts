import { Schema, model, Document, Types } from "mongoose";

import { USAGE_FEATURES, type UsageFeature } from "./usageEventModel";

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

export interface IUsageLedgerDocument extends IUsageLedger, Document {
  _id: Types.ObjectId;
}

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

usageLedgerSchema.index({ orgId: 1, periodKey: 1, feature: 1 }, { unique: true });
usageLedgerSchema.index({ orgId: 1, periodKey: 1, createdAt: -1 });

const UsageLedgerModel = model<IUsageLedgerDocument>("UsageLedger", usageLedgerSchema);
export default UsageLedgerModel;
