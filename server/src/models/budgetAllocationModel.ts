import { Schema, model, Document, Types } from "mongoose";

export interface IBudgetAllocation {
  orgId: Types.ObjectId;
  periodKey: string; // YYYY-MM
  category: string;
  amount: number;
  currency: string;
  createdByUserId?: Types.ObjectId;
  updatedByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBudgetAllocationDocument extends IBudgetAllocation, Document {
  _id: Types.ObjectId;
}

const budgetAllocationSchema = new Schema<IBudgetAllocationDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    periodKey: { type: String, required: true, trim: true, maxlength: 7, index: true },
    category: { type: String, required: true, trim: true, maxlength: 100, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: "USD",
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

budgetAllocationSchema.index({ orgId: 1, periodKey: 1, category: 1 }, { unique: true });
budgetAllocationSchema.index({ orgId: 1, periodKey: 1, updatedAt: -1 });

const BudgetAllocationModel = model<IBudgetAllocationDocument>("BudgetAllocation", budgetAllocationSchema);
export default BudgetAllocationModel;

