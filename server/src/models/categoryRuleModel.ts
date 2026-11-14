import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript contract for automated transaction categorization rules.
// Matches description or raw merchant strings and applies target category classifications.
// Supports pattern evaluation heuristics including exact, prefix, contains, and regex.
export interface ICategoryRule {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Pattern to match — either exact string or regex-style pattern */
  pattern: string;
  /** How to match: contains, starts_with, exact, regex */
  matchType: "contains" | "starts_with" | "exact" | "regex";
  /** Which field to match against */
  matchField: "description" | "category";
  /** The category to assign when the rule matches */
  targetCategory: string;
  /** Optional: override the transaction type */
  targetType?: "income" | "expense" | "investment";
  /** Priority: higher = checked first */
  priority: number;
  enabled: boolean;
  /** How many times this rule was applied */
  appliedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Extends ICategoryRule with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual categorization rule documents within MongoDB storage.
export interface ICategoryRuleDocument extends ICategoryRule, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing transaction categorization rule persistence.
// Enforces pattern string limits, match type enumerations, and priority ordering.
// Automatically manages record creation and modification timestamps for auditability.
const categoryRuleSchema = new Schema<ICategoryRuleDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pattern: { type: String, required: true, trim: true, maxlength: 200 },
    matchType: {
      type: String,
      required: true,
      enum: ["contains", "starts_with", "exact", "regex"],
      default: "contains",
    },
    matchField: {
      type: String,
      required: true,
      enum: ["description", "category"],
      default: "description",
    },
    targetCategory: { type: String, required: true, trim: true, maxlength: 100 },
    targetType: {
      type: String,
      enum: ["income", "expense", "investment"],
      required: false,
    },
    priority: { type: Number, default: 0, index: true },
    enabled: { type: Boolean, default: true },
    appliedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Compound indexes optimizing rule evaluation sequences and active rule lookups.
// Sorts rules by descending priority to evaluate high-precedence heuristics first.
// Accelerates retrieval of enabled rules scoped to user and tenant organization.
categoryRuleSchema.index({ orgId: 1, userId: 1, priority: -1 });
categoryRuleSchema.index({ orgId: 1, userId: 1, enabled: 1 });

// Instantiates Mongoose model bound to MongoDB "CategoryRule" collection.
// Provides strongly typed querying, rule matching, and usage counter increments.
// Consumed by bank import pipelines and automatic transaction categorization logic.
const CategoryRuleModel = model<ICategoryRuleDocument>("CategoryRule", categoryRuleSchema);
// Exports compiled CategoryRuleModel instance as default module export.
// Imported by transaction ingestion controllers, rule editors, and ledger workers.
// Serves as central database access gateway for automated categorization rules.
export default CategoryRuleModel;
