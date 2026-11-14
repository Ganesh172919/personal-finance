import { Schema, model, Document, Types } from "mongoose";
import { authCacheInvalidation } from "../utils/authCacheInvalidation";

// Defines role hierarchy and membership status types for organization collaborators.
// Distinguishes access levels (owner, admin, member) and member states (active, invited, removed).
// Enforces role-based permission checks across multi-tenant API operations.
export type OrgRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "active" | "invited" | "removed";

// Defines the domain attributes linking an individual user to an organization tenant.
// Captures assigned role, active membership state, default workspace selection, and inviter info.
// Represents the authoritative authorization record for user tenant access.
export interface IOrgMember {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrgRole;
  status: OrgMemberStatus;
  isDefault?: boolean;
  invitedEmail?: string;
  invitedByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Extends organization membership properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent membership document returned by tenant authorization queries.
export interface IOrgMemberDocument extends IOrgMember, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the organization membership collection.
// Enforces validation rules on member roles, status enums, and invited email strings.
// Automatically records document creation and modification timestamps on all writes.
const orgMemberSchema = new Schema<IOrgMemberDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "admin", "member"], required: true, default: "owner" },
    status: { type: String, enum: ["active", "invited", "removed"], required: true, default: "active" },
    isDefault: { type: Boolean, default: false },
    invitedEmail: { type: String, trim: true, lowercase: true, maxlength: 200 },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Configures compound database indexes for organization membership resolution.
// Enforces unique membership per user per organization to prevent duplicate records.
// Accelerates lookup of a user's default active organization upon user login.
orgMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
orgMemberSchema.index({ userId: 1, isDefault: 1, createdAt: -1 });

// Attaches authentication cache invalidation hooks to membership lifecycle events.
// Purges cached permission tokens and role context in Redis whenever memberships change.
// Ensures security revocation and role adjustments take effect instantaneously.
orgMemberSchema.plugin(authCacheInvalidation, { source: "member" });

// Compiles and exports the Mongoose model for organization membership records.
// Exposes data access methods to query, grant, update, or revoke tenant memberships.
// Serves as the access control persistence layer for multi-tenant collaboration.
const OrgMemberModel = model<IOrgMemberDocument>("OrgMember", orgMemberSchema);
export default OrgMemberModel;

