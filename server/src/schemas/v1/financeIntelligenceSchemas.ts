/**
 * @fileoverview Zod validation schemas for finance intelligence endpoints (recurring detection, forecasting).
 *
 * Exported schemas:
 *   recurringCandidatesQuerySchema - Validates query for detecting recurring transaction candidates
 *   forecastQuerySchema            - Validates query for cash flow forecasting
 *
 * Used by: v1Routes (GET /finance/recurring/candidates, GET /finance/forecast)
 *
 * Key validation rules:
 *   - Recurring candidates:
 *     - days_back: 30-730 days of history to analyze (default varies)
 *     - limit: 1-100 results
 *     - min_occurrences: 3-24 minimum times a pattern must repeat
 *   - Forecast:
 *     - period_key: optional YYYY-MM format starting period
 *     - months: 1-24 months to forecast ahead
 *     - top_categories: 0-50 categories to include in breakdown
 *   - periodKeySchema imported from financeSchemas for reuse
 */
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

