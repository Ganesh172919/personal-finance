import { Schema, model, Document, Types } from "mongoose";

export type TransactionType = "income" | "expense" | "investment";

export interface ITransactionRecord {
  userId: Types.ObjectId;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: TransactionType;
  legacyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransactionRecordDocument extends ITransactionRecord, Document {
  _id: Types.ObjectId;
}

const transactionSchema = new Schema<ITransactionRecordDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 250 },
    date: { type: Date, required: true, index: true },
    type: { type: String, required: true, enum: ["income", "expense", "investment"], index: true },
    legacyId: { type: Schema.Types.ObjectId, required: false }
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1, date: -1 });
transactionSchema.index({ legacyId: 1 }, { unique: true, sparse: true });

const TransactionModel = model<ITransactionRecordDocument>("Transaction", transactionSchema);
export default TransactionModel;

