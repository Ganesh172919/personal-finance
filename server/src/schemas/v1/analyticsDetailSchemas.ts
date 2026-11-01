/**
 * @fileoverview Zod validation schemas for analytics detail endpoints.
 *
 * Exported schemas:
 *   spendingHeatmapQuerySchema   - Validates query params for spending heatmap
 *   categoryTrendsQuerySchema    - Validates query params for category trends
 *   incomeExpenseQuerySchema     - Validates query params for income vs expense summary
 *   accountBalancesQuerySchema   - Validates query params for account balances
 *   topMerchantsQuerySchema      - Validates query params for top merchants
 *
 * Used by: v1Routes (GET /analytics/spending-heatmap, category-trends, income-expense,
 *          account-balances, top-merchants)
 *
 * Key validation rules:
 *   - days_back: optional integer 1-730 (heatmap)
 *   - months: optional integer 1-24 (trends, income-expense, top-merchants)
 *   - limit: optional integer 1-50 (top-merchants)
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const spendingHeatmapQuerySchema = z
  .object({
    days_back: z.coerce.number().int().min(1).max(730).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

export const categoryTrendsQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

export const incomeExpenseQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

export const accountBalancesQuerySchema = z
  .object({
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

export const topMerchantsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

export const multiCurrencySummaryQuerySchema = z
  .object({
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();
