import { Schema, model, Document, Types } from "mongoose";

export type ShareLinkType = "financial_story";
export type ShareLinkStatus = "active" | "revoked";

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

export interface IShareLinkDocument extends IShareLink, Document {
  _id: Types.ObjectId;
}

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

// Auto-delete expired share links (best-effort; MongoDB TTL cleanup is asynchronous).
shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
shareLinkSchema.index({ orgId: 1, createdByUserId: 1, createdAt: -1 });

const ShareLinkModel = model<IShareLinkDocument>("ShareLink", shareLinkSchema);
export default ShareLinkModel;
