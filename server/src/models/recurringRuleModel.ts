import { Schema, model, Document, Types } from "mongoose";

// Defines status values for recurring transaction detection and scheduling rules.
// Distinguishes between active rule automation and user-disabled rule definitions.
// Controls whether automated rule processors evaluate recurring transaction instances.
export type RecurringRuleStatus = "active" | "disabled";

// Defines the domain attributes for recurring transaction automation rules.
// Stores cron expressions, expected merchant names, category assignments, and value bounds.
// Enables automated prediction, projection, and categorization of recurring subscriptions.
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

// Combines recurring rule properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent recurring rule document returned by database queries.
export interface IRecurringRuleDocument extends IRecurringRule, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the recurring transaction rule collection.
// Enforces validation rules on cron formats, merchant links, and amount thresholds.
// Automatically manages creation and modification timestamps across rule changes.
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

// Configures compound database indexes for scheduled worker polling and updates.
// Accelerates cron worker queries finding active recurring rules due for execution.
// Optimizes user interface views listing recently updated recurring rules.
recurringRuleSchema.index({ orgId: 1, status: 1, nextRunAt: 1 });
recurringRuleSchema.index({ orgId: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for recurring transaction rules.
// Exposes data access methods to query, create, update, or disable recurring schedules.
// Powers recurring bill reminders and subscription cash-flow forecasting.
const RecurringRuleModel = model<IRecurringRuleDocument>("RecurringRule", recurringRuleSchema);
export default RecurringRuleModel;

