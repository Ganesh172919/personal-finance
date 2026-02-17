import { Schema, model, Document, Types } from "mongoose";

export type ReceiptStatus = "parsed" | "confirmed";

export type ReceiptItem = {
  description: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  confidence?: number;
};

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

export type ReceiptConfidence = {
  vendor?: number;
  date?: number;
  total?: number;
  tax?: number;
  currency?: number;
  items?: Array<{ description?: number; total?: number; quantity?: number; unit_price?: number; line?: number }>;
};

export interface IReceipt {
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

export interface IReceiptDocument extends IReceipt, Document {
  _id: Types.ObjectId;
}

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

const receiptSchema = new Schema<IReceiptDocument>(
  {
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

receiptSchema.index({ userId: 1, createdAt: -1 });
receiptSchema.index({ transactionId: 1 }, { sparse: true });

const ReceiptModel = model<IReceiptDocument>("Receipt", receiptSchema);
export default ReceiptModel;
