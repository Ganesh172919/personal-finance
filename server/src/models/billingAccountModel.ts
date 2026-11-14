import { Schema, model, Document, Types } from "mongoose";

// Enumerates supported payment and billing gateway service providers.
// Distinguishes live Stripe integrations from local offline stub implementations.
// Used across subscription controllers to direct checkout and webhook processing.
export type BillingProvider = "stub" | "stripe";
// Represents operational account states for organization billing subscriptions.
// Indicates whether an organization billing account is currently active or disabled.
// Enforces valid billing state assignments across payment processing routines.
export type BillingAccountStatus = "active" | "inactive";

// Defines TypeScript contract representing an organization billing profile.
// Maps organization identity to external payment provider customer tokens.
// Stores provider types, subscription statuses, and auditing timestamp fields.
export interface IBillingAccount {
  orgId: Types.ObjectId;
  provider: BillingProvider;
  status: BillingAccountStatus;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IBillingAccount with Mongoose Document properties and ObjectId identifier.
// Enables runtime database querying, persistence, and typed document methods.
// Represents individual organization billing records stored in MongoDB collection.
export interface IBillingAccountDocument extends IBillingAccount, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing organization billing profile persistence.
// Enforces unique organization mapping, provider enumerations, and string rules.
// Automatically manages createdAt and updatedAt timestamps for lifecycle audits.
const billingAccountSchema = new Schema<IBillingAccountDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    provider: { type: String, enum: ["stub", "stripe"], required: true, default: "stub" },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "active" },
    stripeCustomerId: { type: String, trim: true },
  },
  { timestamps: true }
);

// Configures secondary compound and sparse indexes optimizing billing lookup queries.
// Speeds up provider status checks and maps external Stripe customer IDs efficiently.
// Ensures fast response times when processing incoming webhook payment events.
billingAccountSchema.index({ provider: 1, status: 1 });
billingAccountSchema.index({ stripeCustomerId: 1 }, { sparse: true });

// Instantiates Mongoose model bound to MongoDB "BillingAccount" collection.
// Provides strongly typed querying, customer creation, and account updating logic.
// Primary model used by Stripe webhook handlers and checkout session controllers.
const BillingAccountModel = model<IBillingAccountDocument>("BillingAccount", billingAccountSchema);
// Exports compiled BillingAccountModel instance as default module export.
// Imported by billing controllers, dunning services, and subscription workers.
// Provides centralized database access layer for customer payment profiles.
export default BillingAccountModel;
