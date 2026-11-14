import { Schema, model, Document, Types } from "mongoose";

// Defines the completion status outcome for an automated monthly accounting close run.
// Distinguishes between successful final reconciliation and execution failure conditions.
// Used by reporting workflows to determine whether a monthly ledger has closed reliably.
export type MonthCloseStatus = "succeeded" | "failed";

// Defines aggregate financial metrics and top spending category breakdowns for a month close.
// Captures total income, cumulative expenses, net savings balance, and transaction count.
// Supplies summarized historical figures for period-over-period financial reports.
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

// Defines the core domain properties for a finalized monthly accounting close record.
// Stores multi-tenant references, YYYY-MM period keys, reconciled totals, and linked exports.
// Represents an immutable snapshot of an organization's closed monthly books.
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

// Merges monthly close domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent monthly close document returned by financial audit queries.
export interface IMonthCloseDocument extends IMonthClose, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the monthly close summary collection.
// Enforces period key formatting, status validation, and financial total structures.
// Automatically manages creation and modification timestamps on reconciliation writes.
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

// Configures compound database indexes for tenant-scoped monthly close records.
// Enforces unique close snapshots per period key within an organization to prevent duplicates.
// Optimizes chronological ordering for fetching historical monthly reconciliation summaries.
monthCloseSchema.index({ orgId: 1, periodKey: 1 }, { unique: true });
monthCloseSchema.index({ orgId: 1, createdAt: -1 });
monthCloseSchema.index({ orgId: 1, status: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for monthly close accounting summaries.
// Exposes data access methods to generate, store, and query historical month close records.
// Acts as the authoritative ledger for monthly financial health and budget performance.
const MonthCloseModel = model<IMonthCloseDocument>("MonthClose", monthCloseSchema);
export default MonthCloseModel;

