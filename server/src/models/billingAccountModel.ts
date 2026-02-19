import { Schema, model, Document, Types } from "mongoose";

export type BillingProvider = "stub" | "stripe";
export type BillingAccountStatus = "active" | "inactive";

export interface IBillingAccount {
  orgId: Types.ObjectId;
  provider: BillingProvider;
  status: BillingAccountStatus;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBillingAccountDocument extends IBillingAccount, Document {
  _id: Types.ObjectId;
}

const billingAccountSchema = new Schema<IBillingAccountDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    provider: { type: String, enum: ["stub", "stripe"], required: true, default: "stub" },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "active" },
    stripeCustomerId: { type: String, trim: true },
  },
  { timestamps: true }
);

billingAccountSchema.index({ provider: 1, status: 1 });
billingAccountSchema.index({ stripeCustomerId: 1 }, { sparse: true });

const BillingAccountModel = model<IBillingAccountDocument>("BillingAccount", billingAccountSchema);
export default BillingAccountModel;
