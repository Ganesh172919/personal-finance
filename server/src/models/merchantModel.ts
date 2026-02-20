import { Schema, model, Document, Types } from "mongoose";

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

export interface IMerchantDocument extends IMerchant, Document {
  _id: Types.ObjectId;
}

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

merchantSchema.index({ orgId: 1, normalizedName: 1 }, { unique: true });
merchantSchema.index({ orgId: 1, updatedAt: -1 });

const MerchantModel = model<IMerchantDocument>("Merchant", merchantSchema);
export default MerchantModel;

