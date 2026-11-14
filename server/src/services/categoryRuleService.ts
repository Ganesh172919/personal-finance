import { Types } from "mongoose";
import CategoryRuleModel, { ICategoryRule } from "../models/categoryRuleModel";
import { fireAndForget } from "./deadLetterQueue";

/**
 * Applies org/user category rules to a transaction description.
 * Returns the matched rule (or null) — caller decides whether to override.
 */
// Evaluates active categorization rules sequentially against a transaction descriptor.
// Supports pattern matching strategies including substring containment, prefixes, and regex.
// Asynchronously increments rule match metrics via dead-letter queue background tasks.
export async function matchCategoryRule(
  orgId: Types.ObjectId,
  userId: Types.ObjectId,
  description: string,
  currentCategory?: string,
): Promise<Pick<ICategoryRule, "targetCategory" | "targetType" | "pattern" | "matchType"> | null> {
  const rules = await CategoryRuleModel.find({
    orgId,
    userId,
    enabled: true,
  })
    .sort({ priority: -1 })
    .lean();

  for (const rule of rules) {
    const fieldValue = rule.matchField === "category" ? (currentCategory || "") : description;
    const normalizedField = fieldValue.toLowerCase();
    const normalizedPattern = rule.pattern.toLowerCase();

    let matched = false;
    switch (rule.matchType) {
      case "contains":
        matched = normalizedField.includes(normalizedPattern);
        break;
      case "starts_with":
        matched = normalizedField.startsWith(normalizedPattern);
        break;
      case "exact":
        matched = normalizedField === normalizedPattern;
        break;
      case "regex":
        try {
          matched = new RegExp(rule.pattern, "i").test(fieldValue);
        } catch {
          // Invalid regex — skip
          matched = false;
        }
        break;
    }

    if (matched) {
      // Bump appliedCount (fire and forget to DLQ)
      fireAndForget(
        CategoryRuleModel.updateOne({ _id: rule._id }, { $inc: { appliedCount: 1 } }),
        "increment category rule appliedCount",
        { ruleId: String(rule._id), orgId: String(orgId) }
      );

      return {
        targetCategory: rule.targetCategory,
        targetType: rule.targetType,
        pattern: rule.pattern,
        matchType: rule.matchType,
      };
    }
  }

  return null;
}

/**
 * CRUD operations for category rules.
 */
// Fetches all category assignment rules configured for a specific organization user.
// Orders rules in descending priority sequence to reflect execution precedence.
// Delivers lightweight lean document arrays suitable for rule management user interfaces.
export async function listCategoryRules(orgId: Types.ObjectId, userId: Types.ObjectId) {
  return CategoryRuleModel.find({ orgId, userId }).sort({ priority: -1 }).lean();
}

// Instantiates and persists a new automated transaction categorization rule.
// Configures target category designations, match criteria, priority, and enabled state.
// Initializes usage metrics counters to zero upon successful document creation.
export async function createCategoryRule(
  orgId: Types.ObjectId,
  userId: Types.ObjectId,
  data: {
    pattern: string;
    matchType: ICategoryRule["matchType"];
    matchField: ICategoryRule["matchField"];
    targetCategory: string;
    targetType?: ICategoryRule["targetType"];
    priority?: number;
  },
) {
  return CategoryRuleModel.create({ ...data, orgId, userId, enabled: true, appliedCount: 0 });
}

// Updates pattern parameters or target assignment properties of an existing rule.
// Enforces strict ownership checks using rule, organization, and user identifiers.
// Returns the updated lean category rule document or null if record was not found.
export async function updateCategoryRule(
  ruleId: Types.ObjectId,
  orgId: Types.ObjectId,
  userId: Types.ObjectId,
  data: Partial<Pick<ICategoryRule, "pattern" | "matchType" | "matchField" | "targetCategory" | "targetType" | "priority" | "enabled">>,
) {
  return CategoryRuleModel.findOneAndUpdate(
    { _id: ruleId, orgId, userId },
    { $set: data },
    { new: true },
  ).lean();
}

// Permanently removes a designated category assignment rule from the database.
// Applies tenant and user scope constraints to prevent unauthorized rule deletions.
// Returns standard MongoDB deletion execution results indicating deleted count.
export async function deleteCategoryRule(
  ruleId: Types.ObjectId,
  orgId: Types.ObjectId,
  userId: Types.ObjectId,
) {
  return CategoryRuleModel.deleteOne({ _id: ruleId, orgId, userId });
}
