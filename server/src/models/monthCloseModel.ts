import { Schema, model, Document, Types } from "mongoose";

export type MonthCloseStatus = "succeeded" | "failed";

export type MonthCloseTotals = {
  income: number;
  expenses: number;
  net: number;
  tx_count: number;
};

export type MonthCloseTopCategory = {
  category: string;
  spent: number;
};

export interface IMonthClose {
  orgId: Types.ObjectId;
  periodKey: string; // YYYY-MM
  createdByUserId: Types.ObjectId;
  status: MonthCloseStatus;
  totals: MonthCloseTotals;
  budget?: Record<string, unknown>;
  topCategories?: MonthCloseTopCategory[];
  exportJobId?: Types.ObjectId;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMonthCloseDocument extends IMonthClose, Document {
  _id: Types.ObjectId;
}

const monthCloseSchema = new Schema<IMonthCloseDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    periodKey: { type: String, required: true, trim: true, maxlength: 7, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["succeeded", "failed"], required: true, default: "succeeded", index: true },
    totals: { type: Schema.Types.Mixed, required: true, default: {} },
    budget: { type: Schema.Types.Mixed, default: {} },
    topCategories: { type: [Schema.Types.Mixed], default: [] },
    exportJobId: { type: Schema.Types.ObjectId, ref: "ExportJob" },
    error: { type: String, trim: true, maxlength: 2000 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

monthCloseSchema.index({ orgId: 1, periodKey: 1 }, { unique: true });
monthCloseSchema.index({ orgId: 1, createdAt: -1 });
monthCloseSchema.index({ orgId: 1, status: 1, createdAt: -1 });

const MonthCloseModel = model<IMonthCloseDocument>("MonthClose", monthCloseSchema);
export default MonthCloseModel;

