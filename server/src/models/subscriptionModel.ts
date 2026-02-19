import { Schema, model, Document, Types } from "mongoose";

import type { PlanTier, EntitlementStatus } from "./entitlementModel";

export type SubscriptionProvider = "stub" | "stripe";

export interface ISubscription {
  orgId: Types.ObjectId;
  provider: SubscriptionProvider;
  planTier: PlanTier;
  status: EntitlementStatus;
  seats?: number;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionDocument extends ISubscription, Document {
  _id: Types.ObjectId;
}

const subscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    provider: { type: String, enum: ["stub", "stripe"], required: true, default: "stub" },
    planTier: { type: String, enum: ["free", "pro", "team", "enterprise"], required: true, default: "free" },
    status: { type: String, enum: ["active", "trialing", "past_due", "canceled"], required: true, default: "active" },
    seats: { type: Number, min: 1 },
    stripeSubscriptionId: { type: String, trim: true },
    stripePriceId: { type: String, trim: true },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

subscriptionSchema.index({ provider: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });

const SubscriptionModel = model<ISubscriptionDocument>("Subscription", subscriptionSchema);
export default SubscriptionModel;
