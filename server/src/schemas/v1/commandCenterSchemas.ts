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

// Validates query parameters for fetching unified command center dashboard data.
// Enforces an empty object payload in strict mode to disallow unexpected query keys.
// Ensures clean endpoint consumption across real-time command center widgets.
export const commandCenterQuerySchema = z.object({}).strict();

// Validates query parameters for fetching organizational budget health diagnostics.
// Enforces strict schema evaluation rejecting extraneous or unknown parameters.
// Ensures clean input validation prior to evaluating budget health score metrics.
export const budgetHealthQuerySchema = z.object({}).strict();

// Validates request payloads executing bulk approval on pending review transactions.
// Enforces an array of valid MongoDB ObjectId strings bounded between 1 and 200 items.
// Rejects unexpected properties using strict object schema validation.
export const bulkApproveBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk approve"),
  })
  .strict();

// Validates request payloads executing bulk deletion across multiple ledger transactions.
// Enforces an array of between 1 and 200 valid 24-character hexadecimal ObjectIds.
// Protects bulk deletion endpoints against malformed or unbounded identifier lists.
export const bulkDeleteBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk delete"),
  })
  .strict();

// Validates request payloads applying category reassignment across multiple transactions.
// Accepts an array of up to 200 transaction ObjectIds and an authoritative target category.
// Enforces strict length bounds on category strings to keep ledger records sanitized.
export const bulkCategorizeBodySchema = z
  .object({
    transaction_ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction id"))
      .min(1, "At least one transaction id is required")
      .max(200, "Maximum 200 transactions per bulk categorize"),
    category: z.string().trim().min(1, "Category is required").max(100, "Category too long"),
  })
  .strict();
