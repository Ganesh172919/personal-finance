import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript contract for monthly category budget allocations.
// Encapsulates assigned budget limits, fiscal month period key, and currency.
// Used across envelope calculations and financial intelligence projections.
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

// Extends IBudgetAllocation with Mongoose Document methods and primary key.
// Enables runtime database querying, persistence, and typed document methods.
// Represents individual budget allocation records inside MongoDB collection.
export interface IBudgetAllocationDocument extends IBudgetAllocation, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing category budget allocations.
// Enforces positive amount values, 3-character currency codes, and period keys.
// Automatically manages createdAt and updatedAt timestamps for budget tracking.
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

// Compound indexes ensuring category uniqueness and fast period lookups.
// Enforces unique constraint preventing duplicate category allocations per period.
// Speeds up budget retrieval by organization identifier and period key.
budgetAllocationSchema.index({ orgId: 1, periodKey: 1, category: 1 }, { unique: true });
budgetAllocationSchema.index({ orgId: 1, periodKey: 1, updatedAt: -1 });

// Instantiates Mongoose model bound to MongoDB "BudgetAllocation" collection.
// Provides strongly typed querying, allocation upserts, and budget analytics.
// Consumed by finance controllers, budget rebalancing, and envelope calculators.
const BudgetAllocationModel = model<IBudgetAllocationDocument>("BudgetAllocation", budgetAllocationSchema);
// Exports compiled BudgetAllocationModel instance as default module export.
// Imported by budget routers, financial services, and reporting tools.
// Serves as central database access gateway for category budget quotas.
export default BudgetAllocationModel;
