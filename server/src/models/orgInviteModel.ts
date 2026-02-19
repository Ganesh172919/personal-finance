import { Schema, model, Document, Types } from "mongoose";

import type { OrgRole } from "./orgMemberModel";

export type OrgInviteStatus = "pending" | "accepted" | "revoked" | "expired";

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

export interface IOrgInviteDocument extends IOrgInvite, Document {
  _id: Types.ObjectId;
}

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

orgInviteSchema.index({ orgId: 1, email: 1, status: 1, createdAt: -1 });
orgInviteSchema.index({ orgId: 1, createdAt: -1 });

const OrgInviteModel = model<IOrgInviteDocument>("OrgInvite", orgInviteSchema);
export default OrgInviteModel;

