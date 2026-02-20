import { z } from "zod";

import { periodKeySchema } from "./financeSchemas";

export const recurringCandidatesQuerySchema = z
  .object({
    days_back: z.coerce.number().int().min(30).max(730).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    min_occurrences: z.coerce.number().int().min(3).max(24).optional(),
  })
  .strict();

export const forecastQuerySchema = z
  .object({
    period_key: periodKeySchema.optional(),
    months: z.coerce.number().int().min(1).max(24).optional(),
    top_categories: z.coerce.number().int().min(0).max(50).optional(),
  })
  .strict();

