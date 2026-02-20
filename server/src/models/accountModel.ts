import { Schema, model, Document, Types } from "mongoose";

export type AccountType = "checking" | "savings" | "credit" | "brokerage" | "cash";
export type AccountStatus = "active" | "closed";

export interface IAccount {
  orgId: Types.ObjectId;
  name: string;
  institution?: string;
  type: AccountType;
  currency: string;
  mask?: string;
  status: AccountStatus;
  createdByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAccountDocument extends IAccount, Document {
  _id: Types.ObjectId;
}

const accountSchema = new Schema<IAccountDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    institution: { type: String, trim: true, maxlength: 120 },
    type: {
      type: String,
      required: true,
      enum: ["checking", "savings", "credit", "brokerage", "cash"],
      index: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: "USD",
    },
    mask: { type: String, trim: true, maxlength: 16 },
    status: { type: String, enum: ["active", "closed"], required: true, default: "active", index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

accountSchema.index({ orgId: 1, status: 1, updatedAt: -1 });
accountSchema.index({ orgId: 1, type: 1, status: 1, updatedAt: -1 });

const AccountModel = model<IAccountDocument>("Account", accountSchema);
export default AccountModel;

