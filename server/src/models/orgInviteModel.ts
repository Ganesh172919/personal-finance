import { Schema, model, Document, Types } from "mongoose";

import type { OrgRole } from "./orgMemberModel";

// Defines lifecycle status values for an organization membership invitation.
// Tracks pending acceptance, successful claims, administrative revocation, and expiration.
// Used across team onboarding flows and invitation expiration cleanup routines.
export type OrgInviteStatus = "pending" | "accepted" | "revoked" | "expired";

// Defines the domain attributes for an organization team invite document.
// Stores hashed security tokens, target emails, assigned roles, and inviter references.
// Enforces secure cryptographic token validation when a new collaborator joins.
export interface IOrgInvite {
  orgId: Types.ObjectId;
  email: string;
  role: OrgRole;
  status: OrgInviteStatus;
  tokenHash: string;
  tokenPrefix: string;
  invitedByUserId: Types.ObjectId;
  acceptedByUserId?: Types.ObjectId;
  acceptedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Combines organization invite attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent invitation document returned by team management queries.
export interface IOrgInviteDocument extends IOrgInvite, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the organization invite collection.
// Enforces validation rules on email formats, role assignments, and unique token hashes.
// Automatically tracks invitation creation and update timestamps across writes.
const orgInviteSchema = new Schema<IOrgInviteDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200, index: true },
    role: { type: String, enum: ["owner", "admin", "member"], required: true, default: "member" },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], required: true, default: "pending", index: true },
    tokenHash: { type: String, required: true, trim: true, maxlength: 128, unique: true },
    tokenPrefix: { type: String, required: true, trim: true, maxlength: 16, index: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    acceptedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// Configures compound database indexes for organization invitation queries.
// Accelerates lookups by organization, email, and pending status for duplicate checks.
// Enables rapid retrieval of pending invitations sorted chronologically descending.
orgInviteSchema.index({ orgId: 1, email: 1, status: 1, createdAt: -1 });
orgInviteSchema.index({ orgId: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for team organization invitations.
// Exposes data access methods to issue, accept, revoke, and verify invitations.
// Serves as the persistence backbone for multi-user workspace onboarding.
const OrgInviteModel = model<IOrgInviteDocument>("OrgInvite", orgInviteSchema);
export default OrgInviteModel;

