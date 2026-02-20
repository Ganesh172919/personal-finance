import { Schema, model, Document, Types } from "mongoose";
import type { MutationSource } from "../types/provenance";

export type TransactionType = "income" | "expense" | "investment";

export interface ITransactionSource extends MutationSource {}

export interface ITransactionRecord {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  externalId?: string;
  accountId?: Types.ObjectId;
  merchantId?: Types.ObjectId;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: TransactionType;
  splits?: Array<{
    category: string;
    amount: number;
  }>;
  source?: ITransactionSource;
  legacyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransactionRecordDocument extends ITransactionRecord, Document {
  _id: Types.ObjectId;
}

const transactionSchema = new Schema<ITransactionRecordDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    externalId: { type: String, required: false, trim: true, maxlength: 120 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: false, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: false, index: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 250 },
    date: { type: Date, required: true, index: true },
    type: { type: String, required: true, enum: ["income", "expense", "investment"], index: true },
    splits: {
      type: [
        {
          category: { type: String, required: true, trim: true, maxlength: 100 },
          amount: { type: Number, required: true },
        },
      ],
      required: false,
      default: undefined,
    },
    source: {
      origin: {
        type: String,
        enum: ["manual", "csv_import", "receipt_ocr", "journal", "task_completion", "ai_plan", "connector"],
      },
      request_id: { type: String },
      task_id: { type: String },
      agent_output_id: { type: String },
      receipt_id: { type: String },
      journal_entry_id: { type: String },
      action_link_id: { type: String },
      actor_type: { type: String, enum: ["user", "system", "agent"] },
      source_ref: { type: String },
      note: { type: String },
    },
    legacyId: { type: Schema.Types.ObjectId, required: false }
  },
  { timestamps: true }
);

transactionSchema.index({ orgId: 1, userId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, accountId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, merchantId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, type: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, category: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, "source.origin": 1, date: -1 });
transactionSchema.index({ orgId: 1, externalId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ legacyId: 1 }, { unique: true, sparse: true });

const TransactionModel = model<ITransactionRecordDocument>("Transaction", transactionSchema);
export default TransactionModel;
