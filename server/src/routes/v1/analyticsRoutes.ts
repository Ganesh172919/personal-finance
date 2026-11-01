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

const router = Router();

// ─── Analytics Detail Endpoints ──────────────────────────
router.get(
  "/analytics/spending-heatmap",
  passport.authenticate("jwt", { session: false }),
  validate({ query: spendingHeatmapQuerySchema }),
  asyncRoute(getSpendingHeatmap),
);
router.get(
  "/analytics/category-trends",
  passport.authenticate("jwt", { session: false }),
  validate({ query: categoryTrendsQuerySchema }),
  asyncRoute(getCategoryTrends),
);
router.get(
  "/analytics/income-expense",
  passport.authenticate("jwt", { session: false }),
  validate({ query: incomeExpenseQuerySchema }),
  asyncRoute(getIncomeExpenseSummary),
);
router.get(
  "/analytics/account-balances",
  passport.authenticate("jwt", { session: false }),
  validate({ query: accountBalancesQuerySchema }),
  asyncRoute(getAccountBalances),
);
router.get(
  "/analytics/top-merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ query: topMerchantsQuerySchema }),
  asyncRoute(getTopMerchants),
);
router.get(
  "/analytics/multi-currency-summary",
  passport.authenticate("jwt", { session: false }),
  validate({ query: multiCurrencySummaryQuerySchema }),
  asyncRoute(getMultiCurrencySummary),
);

export default router;
