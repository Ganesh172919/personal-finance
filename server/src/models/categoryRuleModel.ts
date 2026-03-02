import { Schema, model, Document, Types } from "mongoose";

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

export interface ICategoryRuleDocument extends ICategoryRule, Document {
  _id: Types.ObjectId;
}

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

categoryRuleSchema.index({ orgId: 1, userId: 1, priority: -1 });
categoryRuleSchema.index({ orgId: 1, userId: 1, enabled: 1 });

const CategoryRuleModel = model<ICategoryRuleDocument>("CategoryRule", categoryRuleSchema);
export default CategoryRuleModel;
