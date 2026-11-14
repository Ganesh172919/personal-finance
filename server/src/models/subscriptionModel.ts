import { Schema, model, Document, Types } from "mongoose";

import type { PlanTier, EntitlementStatus } from "./entitlementModel";

// Defines payment provider integrations supporting recurring subscription billing.
// Distinguishes between local development simulation stubs and production Stripe processing.
// Directs billing webhooks and customer portal management to the appropriate gateway.
export type SubscriptionProvider = "stub" | "stripe";

// Defines the core attributes for an organization subscription agreement.
// Tracks active tier, billing cadence, seat allocation, and external gateway identifiers.
// Regulates platform feature access and automated subscription renewal cycles.
export interface ISubscription {
  orgId: Types.ObjectId;
  provider: SubscriptionProvider;
  planTier: PlanTier;
  billingCycle?: "monthly" | "annual";
  status: EntitlementStatus;
  seats?: number;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Merges subscription domain properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent subscription document returned by billing entitlement queries.
export interface ISubscriptionDocument extends ISubscription, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the organization subscription collection.
// Enforces uniqueness on organization IDs and validates plan tiers and billing cycle enums.
// Automatically tracks subscription creation and modification timestamps across writes.
const subscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    provider: { type: String, enum: ["stub", "stripe"], required: true, default: "stub" },
    planTier: { type: String, enum: ["free", "pro", "team", "enterprise"], required: true, default: "free" },
    billingCycle: { type: String, enum: ["monthly", "annual"], default: "monthly" },
    status: { type: String, enum: ["active", "trialing", "past_due", "canceled"], required: true, default: "active" },
    seats: { type: Number, min: 1 },
    stripeSubscriptionId: { type: String, trim: true },
    stripePriceId: { type: String, trim: true },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

// Configures compound database indexes for payment provider webhook reconciliation.
// Accelerates subscriber state queries filtering by billing gateway and active status.
// Establishes a sparse index on Stripe subscription IDs for rapid inbound webhook routing.
subscriptionSchema.index({ provider: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });

// Compiles and exports the Mongoose model for organization billing subscriptions.
// Exposes data access methods to query, upgrade, downgrade, or cancel subscription plans.
// Synchronizes billing entitlements with external payment processors and internal state.
const SubscriptionModel = model<ISubscriptionDocument>("Subscription", subscriptionSchema);
export default SubscriptionModel;
