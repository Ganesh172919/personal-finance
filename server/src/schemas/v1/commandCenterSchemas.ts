/**
 * @fileoverview Zod validation schemas for command center and budget health queries.
 *
 * Exported schemas:
 *   commandCenterQuerySchema - Validates query params for command center (currently empty)
 *   budgetHealthQuerySchema  - Validates query params for budget health (currently empty)
 *   bulkApproveBodySchema    - Validates body for bulk transaction approval
 *
 * Used by: financialDataRoutes (GET /command-center, GET /budget-health,
 *          POST /transactions/bulk-approve)
 *
 * Key validation rules:
 *   - transaction_ids: required array of ObjectId strings, 1-200 items
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const commandCenterQuerySchema = z.object({}).strict();

export const budgetHealthQuerySchema = z.object({}).strict();

export const bulkApproveBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk approve"),
  })
  .strict();

export const bulkDeleteBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk delete"),
  })
  .strict();

export const bulkCategorizeBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk categorize"),
    category: z.string().trim().min(1, "Category is required").max(100, "Category too long"),
  })
  .strict();
