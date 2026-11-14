import { Schema, model, Document, Types } from "mongoose";

// Defines type classifications and active states for public financial share links.
// Distinguishes resource share targets and lifecycle states (active, revoked).
// Enforces security boundaries and access permissions on anonymous share endpoints.
export type ShareLinkType = "financial_story";
export type ShareLinkStatus = "active" | "revoked";

// Defines the domain attributes for public, tokenized share links.
// Stores hashed security tokens, expiration deadlines, tenant references, and payloads.
// Enables controlled, read-only external sharing of user milestones and financial stories.
export interface IShareLink {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  type: ShareLinkType;
  tokenHash: string;
  tokenPrefix: string;
  status: ShareLinkStatus;
  expiresAt: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Merges share link domain properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent share link document returned by verification queries.
export interface IShareLinkDocument extends IShareLink, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the public share link collection.
// Enforces validation rules on token prefixes, cryptographic hashes, and expiration dates.
// Automatically manages creation and modification timestamps across write operations.
const shareLinkSchema = new Schema<IShareLinkDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["financial_story"], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenPrefix: { type: String, required: true, trim: true, maxlength: 12, index: true },
    status: { type: String, enum: ["active", "revoked"], required: true, default: "active", index: true },
    expiresAt: { type: Date, required: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true }
);

// Configures automated TTL eviction and chronological lookups for share links.
// Establishes a Time-To-Live index on expiresAt to auto-purge expired public links.
// Optimizes user management queries listing active shared links by creation date.
// Auto-delete expired share links (best-effort; MongoDB TTL cleanup is asynchronous).
shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
shareLinkSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for public share link tokens.
// Exposes data access methods to generate, resolve, and revoke public sharing links.
// Powers external story preview and public report presentation endpoints.
const ShareLinkModel = model<IShareLinkDocument>("ShareLink", shareLinkSchema);
export default ShareLinkModel;
