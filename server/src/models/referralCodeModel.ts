import { Schema, model, Document, Types } from "mongoose";

// Defines the domain attributes for an organization growth referral code.
// Stores the alphanumeric promo code string, target organization, and owner user link.
// Enables user acquisition incentives and referral credit distribution.
export interface IReferralCode {
  orgId: Types.ObjectId;
  code: string;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Merges referral code attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent referral code document returned by promo queries.
export interface IReferralCodeDocument extends IReferralCode, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the referral code collection.
// Enforces uniqueness on organization IDs and uppercase promo code strings.
// Automatically manages document creation and modification timestamps on all writes.
const referralCodeSchema = new Schema<IReferralCodeDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 16, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

// Configures a compound database index on the creator user and creation timestamp.
// Optimizes user dashboard queries displaying generated referral links in chronological order.
// Facilitates quick verification of referral ownership during promo redemption.
referralCodeSchema.index({ createdByUserId: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for customer referral codes.
// Exposes data access methods to generate, validate, and retrieve promotion codes.
// Powers the platform referral incentive program and reward attribution.
const ReferralCodeModel = model<IReferralCodeDocument>("ReferralCode", referralCodeSchema);
export default ReferralCodeModel;

