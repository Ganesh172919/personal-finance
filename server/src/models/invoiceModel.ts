import { Schema, model, Document, Types } from "mongoose";

export type InvoiceStatus = "paid" | "void" | "refunded";
export type BillingCycle = "monthly" | "annual";

export interface IInvoice {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  invoiceNumber: string;
  planTier: "pro" | "team" | "enterprise";
  billingCycle: BillingCycle;
  amountUsd: number;
  taxUsd: number;
  totalUsd: number;
  currency?: string;
  amountLocalized?: number;
  taxLocalized?: number;
  totalLocalized?: number;
  status: InvoiceStatus;
  paymentMethod: string;
  periodStart: Date;
  periodEnd: Date;
  issuedAt: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoiceDocument extends IInvoice, Document {
  _id: Types.ObjectId;
}

const invoiceSchema = new Schema<IInvoiceDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    planTier: { type: String, enum: ["pro", "team", "enterprise"], required: true },
    billingCycle: { type: String, enum: ["monthly", "annual"], required: true, default: "monthly" },
    amountUsd: { type: Number, required: true },
    taxUsd: { type: Number, required: true, default: 0 },
    totalUsd: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    amountLocalized: { type: Number },
    taxLocalized: { type: Number },
    totalLocalized: { type: Number },
    status: { type: String, enum: ["paid", "void", "refunded"], required: true, default: "paid" },
    paymentMethod: { type: String, required: true, default: "Card ending in 4242" },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

invoiceSchema.index({ orgId: 1, issuedAt: -1 });

const InvoiceModel = model<IInvoiceDocument>("Invoice", invoiceSchema);
export default InvoiceModel;
