import { Schema, model, Document, Types } from "mongoose";

export interface IReferralCode {
  orgId: Types.ObjectId;
  code: string;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralCodeDocument extends IReferralCode, Document {
  _id: Types.ObjectId;
}

const referralCodeSchema = new Schema<IReferralCodeDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 16, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

referralCodeSchema.index({ createdByUserId: 1, createdAt: -1 });

const ReferralCodeModel = model<IReferralCodeDocument>("ReferralCode", referralCodeSchema);
export default ReferralCodeModel;

