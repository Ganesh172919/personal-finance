/**
 * @fileoverview Analytics detail routes for spending heatmap, category trends,
 * income/expense summaries, account balances, and top merchants.
 *
 * Endpoints:
 *   GET /analytics/spending-heatmap   - Spending heatmap data
 *   GET /analytics/category-trends    - Category trend data
 *   GET /analytics/income-expense     - Income vs expense summary
 *   GET /analytics/account-balances   - Account balance breakdown
 *   GET /analytics/top-merchants      - Top merchants by spend
 *
 * Middleware:
 *   - Passport JWT authentication on all endpoints
 *   - Zod validation on query per endpoint
 *
 * Controllers: analyticsDetailController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../../middleware/validate";
import { asyncRoute } from "../../utils/asyncRoute";
import {
  spendingHeatmapQuerySchema,
  categoryTrendsQuerySchema,
  incomeExpenseQuerySchema,
  accountBalancesQuerySchema,
  topMerchantsQuerySchema,
  multiCurrencySummaryQuerySchema,
} from "../../schemas/v1/analyticsDetailSchemas";
import {
  getSpendingHeatmap,
  getCategoryTrends,
  getIncomeExpenseSummary,
  getAccountBalances,
  getTopMerchants,
  getMultiCurrencySummary,
} from "../../controllers/v1/analyticsDetailController";

// Express router instance dedicated to v1 analytics detail endpoints.
// Dispatches queries for spending visualizations, balances, and trends.
// Protects each route with JWT authentication and strict Zod validation.
const router = Router();

// ─── Analytics Detail Endpoints ──────────────────────────
// Computes spending intensity aggregated across day and time matrices.
// Validates time window parameters and extracts user auth context.
// Invokes getSpendingHeatmap controller within asynchronous route wrapper.
router.get(
  "/analytics/spending-heatmap",
  passport.authenticate("jwt", { session: false }),
  validate({ query: spendingHeatmapQuerySchema }),
  asyncRoute(getSpendingHeatmap),
);
// Calculates periodic expenditure patterns grouped by expense categories.
// Validates date range intervals and ensures authenticated access.
// Delegates computation to getCategoryTrends controller handler.
router.get(
  "/analytics/category-trends",
  passport.authenticate("jwt", { session: false }),
  validate({ query: categoryTrendsQuerySchema }),
  asyncRoute(getCategoryTrends),
);
// Aggregates net cash flow comparing total income against expenses.
// Validates query filters for date bounds and currency conversions.
// Calls getIncomeExpenseSummary controller returning delta breakdown.
router.get(
  "/analytics/income-expense",
  passport.authenticate("jwt", { session: false }),
  validate({ query: incomeExpenseQuerySchema }),
  asyncRoute(getIncomeExpenseSummary),
);
// Provides snapshots of account balances and asset allocations across institutions.
// Validates query parameters such as account types and status flags.
// Dispatches to getAccountBalances controller for balance summarization.
router.get(
  "/analytics/account-balances",
  passport.authenticate("jwt", { session: false }),
  validate({ query: accountBalancesQuerySchema }),
  asyncRoute(getAccountBalances),
);
// Identifies highest volume and highest frequency transaction merchants.
// Validates ranking limits and date boundary parameters.
// Passes request execution to getTopMerchants controller handler.
router.get(
  "/analytics/top-merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ query: topMerchantsQuerySchema }),
  asyncRoute(getTopMerchants),
);
// Formulates consolidated financial metrics converted across foreign currencies.
// Validates target currency codes and historical rate query filters.
// Invokes getMultiCurrencySummary controller inside asyncRoute wrapper.
router.get(
  "/analytics/multi-currency-summary",
  passport.authenticate("jwt", { session: false }),
  validate({ query: multiCurrencySummaryQuerySchema }),
  asyncRoute(getMultiCurrencySummary),
);

// Exports configured analytics detail router as default module output.
// Registers all statistical and trend calculation routes under v1 prefix.
// Enables seamless integration with primary API application router.
export default router;
