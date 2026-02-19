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

