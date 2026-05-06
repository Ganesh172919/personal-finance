/**
 * @fileoverview Zod validation schemas for data export endpoints.
 *
 * Exported schemas:
 *   createExportBodySchema  - Validates creating a new export (discriminated union by type)
 *   listExportsQuerySchema  - Validates listing exports with optional status filter
 *
 * Export types:
 *   transactions_csv    - CSV export of transactions with optional date range, type, and category filters
 *   monthly_summary_pdf - PDF summary for a specific month (requires period_key in YYYY-MM format)
 *
 * Used by: v1Routes (POST /exports, GET /exports)
 *
 * Key validation rules:
 *   - Discriminated union on "type" field: transactions_csv | monthly_summary_pdf
 *   - transactions_csv params: optional ISO date strings for date_from/date_to, tx_type enum, category
 *   - monthly_summary_pdf params: required period_key matching YYYY-MM format
 *   - idempotency_key: optional 8-128 char string for deduplication
 *   - listExports status filter: queued | running | succeeded | failed
 *   - listExports limit: 1-100
 */
import { z } from "zod";

const isoDateString = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

const transactionsCsvParamsSchema = z
  .object({
    date_from: isoDateString.optional(),
    date_to: isoDateString.optional(),
    tx_type: transactionTypeSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const periodKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)");

const monthlySummaryPdfParamsSchema = z
  .object({
    period_key: periodKeySchema,
  })
  .strict();

export const createExportBodySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("transactions_csv"),
      params: transactionsCsvParamsSchema.optional().default({}),
      idempotency_key: z.string().trim().min(8).max(128).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("monthly_summary_pdf"),
      params: monthlySummaryPdfParamsSchema,
      idempotency_key: z.string().trim().min(8).max(128).optional(),
    })
    .strict(),
]);

export const listExportsQuerySchema = z
  .object({
    status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

