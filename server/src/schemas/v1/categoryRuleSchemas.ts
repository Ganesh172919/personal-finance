import { z } from "zod";

export const createCategoryRuleBodySchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  matchType: z.enum(["contains", "starts_with", "exact", "regex"]).default("contains"),
  matchField: z.enum(["description", "category"]).default("description"),
  targetCategory: z.string().trim().min(1).max(100),
  targetType: z.enum(["income", "expense", "investment"]).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export const updateCategoryRuleBodySchema = createCategoryRuleBodySchema.partial().extend({
  enabled: z.boolean().optional(),
});

export const categoryRuleIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
});
