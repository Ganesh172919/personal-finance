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

// Validates ISO-formatted date string parameters for export time windows.
// Enforces string length boundaries and verifies string parses to a real timestamp.
// Prevents invalid date inputs from causing database query errors during exports.
const isoDateString = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

// Defines acceptable transaction types for export filtering.
// Constrains values strictly to income, expense, or investment classifications.
// Ensures database query filters receive well-defined transaction categories.
const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

// Validates parameters supplied for generating CSV transaction exports.
// Checks optional date ranges, transaction types, categories, and custom columns.
// Enforces that date_from chronologically precedes date_to when both are present.
const transactionsCsvParamsSchema = z
  .object({
    date_from: isoDateString.optional(),
    date_to: isoDateString.optional(),
    tx_type: transactionTypeSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    columns: z.array(z.string().trim().min(1).max(50)).min(1).max(25).optional(),
  })
  .strict()
  // date_to is an exclusive upper bound, so an empty or inverted window can never match.
  .refine(
    (params) =>
      !params.date_from || !params.date_to || new Date(params.date_from).getTime() < new Date(params.date_to).getTime(),
    { message: "date_from must be before date_to", path: ["date_to"] }
  );

// Validates period key formatting matching year and month pattern YYYY-MM.
// Ensures the reporting period adheres to a standard monthly billing identifier.
// Prevents malformed period keys from causing lookup failures in report generation.
const periodKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)");

// Validates parameters required for generating monthly summary PDF exports.
// Ensures the target period key is provided and formatted correctly.
// Restricts unknown properties from contaminating PDF generator options.
const monthlySummaryPdfParamsSchema = z
  .object({
    period_key: periodKeySchema,
  })
  .strict();

// Validates the request body payload when requesting a new asynchronous export.
// Uses a discriminated union to dispatch validation according to export type.
// Validates parameters and optional idempotency keys for transaction CSVs and PDF summaries.
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

// Validates query parameters when listing previously generated export records.
// Supports filtering export jobs by current execution status.
// Limits maximum query results between 1 and 100 to prevent payload overruns.
export const listExportsQuerySchema = z
  .object({
    status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

