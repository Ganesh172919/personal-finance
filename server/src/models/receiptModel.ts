import { Schema, model, Document, Types } from "mongoose";

// Defines lifecycle status values for scanned receipts.
// Distinguishes between initial OCR parsing and final user-confirmed transactions.
// Governs transaction creation workflows and reconciliation pipelines.
export type ReceiptStatus = "parsed" | "confirmed";

// Defines an individual line item extracted from a parsed receipt document.
// Captures item descriptions, purchased quantities, unit prices, and line confidence.
// Feeds detailed itemization data to downstream expense categorizers.
export type ReceiptItem = {
  description: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  confidence?: number;
};

// Defines the structured entities parsed from receipt OCR scans.
// Contains vendor names, transaction dates, tax, totals, currency, and line items.
// Serves as the raw structured payload extracted by AI computer vision models.
export type ReceiptExtracted = {
  vendor?: string;
  date?: string; // YYYY-MM-DD
  total?: number;
  tax?: number;
  currency?: string;
  items?: ReceiptItem[];
  raw_text?: string;
  category_suggestion?: string;
};

// Defines confidence scoring metrics across all extracted receipt fields.
// Supplies field-level certainty percentages for vendors, totals, dates, and items.
// Enables user review UIs to highlight low-confidence items needing manual correction.
export type ReceiptConfidence = {
  vendor?: number;
  date?: number;
  total?: number;
  tax?: number;
  currency?: number;
  items?: Array<{ description?: number; total?: number; quantity?: number; unit_price?: number; line?: number }>;
};

// Defines the core domain attributes for a scanned receipt document.
// Stores multi-tenant references, OCR extractions, user corrections, and transaction links.
// Bridges uploaded media files with ledger transaction records.
export interface IReceipt {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  fileId: Types.ObjectId;
  status: ReceiptStatus;
  extracted: ReceiptExtracted;
  confidence: ReceiptConfidence;
  warnings: string[];
  categorySuggestion?: string;
  corrections?: ReceiptExtracted;
  transactionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Extends receipt attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent receipt document returned by receipt management queries.
export interface IReceiptDocument extends IReceipt, Document {
  _id: Types.ObjectId;
}

// Defines the subdocument Mongoose schema for individual receipt line items.
// Enforces length constraints on descriptions and numerical bounds on prices.
// Configured with _id: false to optimize subdocument storage overhead.
const receiptItemSchema = new Schema<ReceiptItem>(
  {
    description: { type: String, required: true, trim: true, maxlength: 250 },
    quantity: { type: Number },
    unit_price: { type: Number },
    total: { type: Number },
    confidence: { type: Number },
  },
  { _id: false }
);

// Defines the embedded Mongoose schema for structured receipt OCR data.
// Maps vendors, dates, tax amounts, line item arrays, and raw text representations.
// Reusable across both initial machine extractions and subsequent user corrections.
const receiptExtractedSchema = new Schema<ReceiptExtracted>(
  {
    vendor: { type: String, trim: true, maxlength: 250 },
    date: { type: String, trim: true, maxlength: 20 },
    total: { type: Number },
    tax: { type: Number },
    currency: { type: String, trim: true, maxlength: 10 },
    items: { type: [receiptItemSchema], default: [] },
    raw_text: { type: String },
    category_suggestion: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

// Configures the primary Mongoose schema mapping for the receipt collection.
// Enforces tenant references, file links, and embedded OCR extraction schemas.
// Automatically tracks receipt creation and modification timestamps across writes.
const receiptSchema = new Schema<IReceiptDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ["parsed", "confirmed"], default: "parsed", required: true },
    extracted: { type: receiptExtractedSchema, required: true, default: {} },
    confidence: { type: Schema.Types.Mixed, required: true, default: {} },
    warnings: { type: [String], default: [] },
    categorySuggestion: { type: String, trim: true, maxlength: 100 },
    corrections: { type: receiptExtractedSchema, required: false },
    transactionId: { type: Schema.Types.ObjectId, required: false },
  },
  { timestamps: true }
);

// Configures compound database indexes for receipt history and transaction lookups.
// Optimizes chronological ordering for fetching user receipts within an organization.
// Establishes a sparse index on transactionId to accelerate receipt reconciliation queries.
receiptSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
receiptSchema.index({ orgId: 1, transactionId: 1 }, { sparse: true });

// Compiles and exports the Mongoose model for scanned receipt records.
// Exposes data access methods to store OCR results, apply edits, and link transactions.
// Serves as the primary persistence layer for automated receipt ingestion pipelines.
const ReceiptModel = model<IReceiptDocument>("Receipt", receiptSchema);
export default ReceiptModel;
