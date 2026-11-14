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

// Validates query parameters for generating the calendar spending heatmap visualization.
// Bounds the historical days_back range between 1 and 730 days of transactions.
// Supports optional currency normalization overrides across multi-currency ledgers.
export const spendingHeatmapQuerySchema = z
  .object({
    days_back: z.coerce.number().int().min(1).max(730).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters for calculating multi-month expense category trends.
// Restricts evaluation horizon between 1 and 24 months of historical transactions.
// Enforces strict schema constraints while permitting currency display overrides.
export const categoryTrendsQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters for monthly income vs expense velocity charts.
// Limits historical evaluation horizons up to 24 consecutive calendar months.
// Rejects unexpected query parameters using strict schema evaluation.
export const incomeExpenseQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters for retrieving unified bank and credit account balances.
// Supports currency conversion parameters across supported global currencies.
// Ensures strict query schema evaluation across account balance endpoints.
export const accountBalancesQuerySchema = z
  .object({
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters for aggregating top merchant expenditure volumes.
// Restricts result limits between 1 and 50 merchants across up to 24 months.
// Facilitates vendor concentration analysis and merchant spending rankings.
export const topMerchantsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    months: z.coerce.number().int().min(1).max(24).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters requesting consolidated multi-currency ledger balances.
// Accepts an optional target base currency for exchange rate conversions.
// Enforces strict parameter validation to keep currency summary queries sanitized.
export const multiCurrencySummaryQuerySchema = z
  .object({
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();
