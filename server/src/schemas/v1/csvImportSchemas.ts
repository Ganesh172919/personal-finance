/**
 * @fileoverview Zod validation schemas for CSV transaction import endpoints.
 *
 * Exported schemas:
 *   transactionsCsvImportBodySchema - Validates the CSV import request body (column mapping + options)
 *
 * Used by: v1Routes (POST /integrations/transactions_csv/import)
 *
 * Key validation rules:
 *   - mapping: required object defining CSV column-to-field mapping (JSON string or object)
 *     Fields: amount (required), date (required), description/category/type/merchant (optional)
 *   - account_id: optional 24-char hex ObjectId to associate transactions with an account
 *   - dry_run: optional boolean (string "true"/"1" coerced to true) for preview without saving
 *   - remember_mapping: optional boolean to persist mapping for future imports
 *   - Uses z.preprocess to handle multipart form data where booleans arrive as strings
 */
import { z } from "zod";

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const transactionsCsvImportBodySchema = z
  .object({
    mapping: z.preprocess(
      parseJson,
      z
        .object({
          amount: z.string().trim().min(1).max(120),
          date: z.string().trim().min(1).max(120),
          description: z.string().trim().min(1).max(120).optional(),
          category: z.string().trim().min(1).max(120).optional(),
          type: z.string().trim().min(1).max(120).optional(),
          merchant: z.string().trim().min(1).max(120).optional(),
        })
        .strict()
    ),
    account_id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    dry_run: z.preprocess((v) => (typeof v === "string" ? v === "true" || v === "1" : v), z.boolean().optional()),
    remember_mapping: z.preprocess((v) => (typeof v === "string" ? v === "true" || v === "1" : v), z.boolean().optional()),
  })
  .strict();
