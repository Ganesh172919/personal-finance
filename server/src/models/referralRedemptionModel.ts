import { Schema, model, Document, Types } from "mongoose";

import type { CreditFeature } from "./creditGrantModel";

export interface IReferralReward {
  periods: string[];
  unitsByFeature: Partial<Record<CreditFeature, number>>;
}

export interface IReferralRedemption {
  codeId: Types.ObjectId;
  referralCode: string;
  referrerOrgId: Types.ObjectId;
  referrerUserId: Types.ObjectId;
  referredOrgId: Types.ObjectId;
  referredUserId: Types.ObjectId;
  redeemedAt: Date;
  reward: IReferralReward;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralRedemptionDocument extends IReferralRedemption, Document {
  _id: Types.ObjectId;
}

const referralRedemptionSchema = new Schema<IReferralRedemptionDocument>(
  {
    codeId: { type: Schema.Types.ObjectId, ref: "ReferralCode", required: true, index: true },
    referralCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 16, index: true },
    referrerOrgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    referrerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referredOrgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true, index: true },
    referredUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    redeemedAt: { type: Date, required: true, default: Date.now, index: true },
    reward: {
      periods: { type: [String], default: [] },
      unitsByFeature: { type: Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

referralRedemptionSchema.index({ referrerOrgId: 1, redeemedAt: -1 });
referralRedemptionSchema.index({ referredUserId: 1, redeemedAt: -1 });

const ReferralRedemptionModel = model<IReferralRedemptionDocument>("ReferralRedemption", referralRedemptionSchema);
export default ReferralRedemptionModel;

