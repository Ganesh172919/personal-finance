import { Types } from "mongoose";
import CategoryRuleModel, { ICategoryRule } from "../models/categoryRuleModel";

/**
 * Applies org/user category rules to a transaction description.
 * Returns the matched rule (or null) — caller decides whether to override.
 */
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
      // Bump appliedCount (fire and forget)
      void CategoryRuleModel.updateOne({ _id: rule._id }, { $inc: { appliedCount: 1 } }).catch(() => {});

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
export async function listCategoryRules(orgId: Types.ObjectId, userId: Types.ObjectId) {
  return CategoryRuleModel.find({ orgId, userId }).sort({ priority: -1 }).lean();
}

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

export async function deleteCategoryRule(
  ruleId: Types.ObjectId,
  orgId: Types.ObjectId,
  userId: Types.ObjectId,
) {
  return CategoryRuleModel.deleteOne({ _id: ruleId, orgId, userId });
}
