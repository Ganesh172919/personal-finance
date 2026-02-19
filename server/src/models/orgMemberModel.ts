import { Schema, model, Document, Types } from "mongoose";

export type OrgRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "active" | "invited" | "removed";

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

export interface IOrgMemberDocument extends IOrgMember, Document {
  _id: Types.ObjectId;
}

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

orgMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
orgMemberSchema.index({ userId: 1, isDefault: 1, createdAt: -1 });

const OrgMemberModel = model<IOrgMemberDocument>("OrgMember", orgMemberSchema);
export default OrgMemberModel;

