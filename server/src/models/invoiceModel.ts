import { Schema, model, Document, Types } from "mongoose";

// Defines type unions for invoice payment status and billing subscription intervals.
// Captures payment settlement states (paid, void, refunded) and cycles (monthly, annual).
// Used across billing account services, dunning workflows, and customer receipt generation.
export type InvoiceStatus = "paid" | "void" | "refunded";
export type BillingCycle = "monthly" | "annual";

// Defines the domain properties for an organization billing invoice record.
// Stores monetary totals in USD and localized currencies, tax, line items, and billing periods.
// Represents financial audit artifacts generated upon recurring subscription renewal.
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

// Extends the base invoice interface with Mongoose Document properties.
// Exposes MongoDB ObjectId, document methods, and audit timestamps.
// Represents the strongly-typed document returned by database billing queries.
export interface IInvoiceDocument extends IInvoice, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for the organization billing invoice collection.
// Enforces validation rules on invoice numbers, currency values, plan tiers, and dates.
// Automates creation and modification timestamps on all invoice modifications.
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
    status: { type: String, enum: ["paid", "void", "refunded"], required: true },
    paymentMethod: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Configures compound database index on organization ID and issue date.
// Optimizes billing history queries and chronological invoice statement sorting.
// Facilitates rapid retrieval of organization billing records in the admin portal.
invoiceSchema.index({ orgId: 1, issuedAt: -1 });

// Compiles and exports the Mongoose model for invoice records.
// Exposes data access methods to query, generate, and adjust customer billing invoices.
// Integrates with payment gateway webhooks and financial accounting services.
const InvoiceModel = model<IInvoiceDocument>("Invoice", invoiceSchema);
export default InvoiceModel;
