/**
 * @fileoverview Zod validation schemas for auto-categorization rule management.
 *
 * Exported schemas:
 *   createCategoryRuleBodySchema  - Validates creating a new categorization rule
 *   updateCategoryRuleBodySchema  - Validates updating an existing rule (partial + enabled flag)
 *   categoryRuleIdParamSchema     - Validates the :id route param as a valid ObjectId
 *
 * Used by: v1Routes (GET/POST/PATCH/DELETE /category-rules)
 *
 * Key validation rules:
 *   - pattern: required, 1-200 chars (the text pattern to match)
 *   - matchType: enum contains | starts_with | exact | regex (default "contains")
 *   - matchField: enum description | category (default "description")
 *   - targetCategory: required, 1-100 chars (the category to assign on match)
 *   - targetType: optional enum income | expense | investment
 *   - priority: optional integer 0-1000 (higher = checked first)
 *   - Update schema extends create schema with partial() + optional enabled boolean
 */
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
