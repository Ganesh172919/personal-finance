import { Schema, model, Document, Types } from "mongoose";

import type { CreditFeature } from "./creditGrantModel";

// Defines the reward package granted upon successful referral redemption.
// Specifies active billing credit periods and unit allowances per platform feature.
// Applied to both referrer and referee accounts to unlock tier capabilities.
export interface IReferralReward {
  periods: string[];
  unitsByFeature: Partial<Record<CreditFeature, number>>;
}

// Defines the domain attributes capturing a completed referral code redemption.
// Stores references to both referring and invited organizations and users.
// Records redemption timestamps and awarded credit allowances for audit tracking.
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

// Combines referral redemption attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent redemption record returned by growth attribution queries.
export interface IReferralRedemptionDocument extends IReferralRedemption, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the referral redemption collection.
// Enforces one redemption per referred organization to prevent duplicate reward grants.
// Automatically tracks record creation and update timestamps across writes.
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

// Configures compound database indexes for querying redemption history.
// Accelerates referrer reward summary aggregation and timeline lookups.
// Optimizes user account views showing successful invitations and claimed rewards.
referralRedemptionSchema.index({ referrerOrgId: 1, redeemedAt: -1 });
referralRedemptionSchema.index({ referredUserId: 1, redeemedAt: -1 });

// Compiles and exports the Mongoose model for referral code redemption records.
// Exposes data access methods to record, verify, and query successful promotions.
// Powers growth analytics, anti-fraud redemption checks, and billing credit grants.
const ReferralRedemptionModel = model<IReferralRedemptionDocument>("ReferralRedemption", referralRedemptionSchema);
export default ReferralRedemptionModel;

