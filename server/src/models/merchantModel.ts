import { Schema, model, Document, Types } from "mongoose";

// Defines the core merchant profile attributes for expense classification.
// Stores standard merchant names, normalized match keys, default categories, and known aliases.
// Enables automated transaction normalization and accurate spending aggregation.
export interface IMerchant {
  orgId: Types.ObjectId;
  name: string;
  normalizedName: string;
  categoryDefault?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Merges merchant domain properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent merchant document returned by catalog lookup queries.
export interface IMerchantDocument extends IMerchant, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the merchant directory collection.
// Enforces validation rules on merchant names, trimmed lowercase slugs, and alias arrays.
// Manages automated document creation and modification timestamps across write operations.
const merchantSchema = new Schema<IMerchantDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, maxlength: 160, index: true },
    categoryDefault: { type: String, trim: true, maxlength: 100 },
    aliases: { type: [{ type: String, trim: true, maxlength: 160 }], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Configures compound database indexes for organization-scoped merchant lookups.
// Enforces unique normalized merchant names per organization to prevent duplication.
// Optimizes chronological ordering for fetching recently updated merchant records.
merchantSchema.index({ orgId: 1, normalizedName: 1 }, { unique: true });
merchantSchema.index({ orgId: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for merchant directory entries.
// Provides data access methods to query, create, and update merchant profiles.
// Serves as the persistence backbone for transaction categorization and merchant rules.
const MerchantModel = model<IMerchantDocument>("Merchant", merchantSchema);
export default MerchantModel;

