import { Schema, model, Document, Types } from "mongoose";

export type RecurringRuleStatus = "active" | "disabled";

export interface IRecurringRule {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  status: RecurringRuleStatus;
  name: string;
  cron: string;
  merchantId?: Types.ObjectId;
  merchantName?: string;
  category?: string;
  amountMin?: number;
  amountMax?: number;
  nextRunAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRecurringRuleDocument extends IRecurringRule, Document {
  _id: Types.ObjectId;
}

const recurringRuleSchema = new Schema<IRecurringRuleDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "disabled"], required: true, default: "active", index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    cron: { type: String, required: true, trim: true, maxlength: 120 },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant" },
    merchantName: { type: String, trim: true, maxlength: 160 },
    category: { type: String, trim: true, maxlength: 100 },
    amountMin: { type: Number, min: 0 },
    amountMax: { type: Number, min: 0 },
    nextRunAt: { type: Date, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

recurringRuleSchema.index({ orgId: 1, status: 1, nextRunAt: 1 });
recurringRuleSchema.index({ orgId: 1, updatedAt: -1 });

const RecurringRuleModel = model<IRecurringRuleDocument>("RecurringRule", recurringRuleSchema);
export default RecurringRuleModel;

