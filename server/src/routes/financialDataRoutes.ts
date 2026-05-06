/**
 * @fileoverview Financial data routes for managing transactions, goals, and debts.
 *
 * Endpoints:
 *   POST   /transactions                - Create a new transaction
 *   POST   /transactions/import         - Bulk import transactions from an array
 *   GET    /transactions/recent         - List recent transactions (limited)
 *   GET    /transactions/summary        - Get aggregated transaction summary within a date range
 *   GET    /transactions                - List transactions with pagination and filters
 *   PATCH  /transactions/:id            - Update an existing transaction
 *   DELETE /transactions/:id            - Delete a transaction
 *   GET    /dashboard/summary           - Get dashboard summary data
 *   GET    /portfolio/summary           - Get portfolio summary with optional month range
 *   POST   /goals                       - Create a new financial goal
 *   PATCH  /goals/:goalId               - Update an existing goal
 *   DELETE /goals/:goalId               - Delete a goal
 *   POST   /debts                       - Create a new debt entry
 *   PATCH  /debts/:debtId               - Update an existing debt
 *   DELETE /debts/:debtId               - Delete a debt
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Zod validation (financialDataSchemas) on params, query, and body
 *
 * Controllers: financialDataController
 */
import { Router } from "express";
import passport from "passport";
import {
  createDebt,
  createGoal,
  createTransaction,
  importTransactions,
  deleteDebt,
  deleteGoal,
  deleteTransaction,
  getDashboardSummary,
  getPortfolioSummary,
  getTransactionsSummary,
  listRecentTransactions,
  listTransactions,
  updateDebt,
  updateGoal,
  updateTransaction,
  getCommandCenter,
  getBudgetHealth,
  approveTransactionEndpoint,
  bulkApproveEndpoint,
  alwaysCategorizeEndpoint,
} from "../controllers/financialDataController";
import { validate } from "../middleware/validate";
import {
  createDebtBodySchema,
  createGoalBodySchema,
  createTransactionBodySchema,
  dashboardSummaryQuerySchema,
  debtIdParamSchema,
  goalIdParamSchema,
  importTransactionsBodySchema,
  recentTransactionsQuerySchema,
  portfolioSummaryQuerySchema,
  listTransactionsQuerySchema,
  transactionsSummaryQuerySchema,
  transactionIdParamSchema,
  updateDebtBodySchema,
  updateGoalBodySchema,
  updateTransactionBodySchema
} from "../schemas/financialDataSchemas";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post("/transactions", validate({ body: createTransactionBodySchema }), asyncRoute(createTransaction));
router.post("/transactions/import", validate({ body: importTransactionsBodySchema }), asyncRoute(importTransactions));
router.get("/transactions/recent", validate({ query: recentTransactionsQuerySchema }), asyncRoute(listRecentTransactions));
router.get("/transactions/summary", validate({ query: transactionsSummaryQuerySchema }), asyncRoute(getTransactionsSummary));
router.get("/dashboard/summary", validate({ query: dashboardSummaryQuerySchema }), asyncRoute(getDashboardSummary));
router.get("/portfolio/summary", validate({ query: portfolioSummaryQuerySchema }), asyncRoute(getPortfolioSummary));
router.get("/transactions", validate({ query: listTransactionsQuerySchema }), asyncRoute(listTransactions));
router.patch(
  "/transactions/:id",
  validate({ params: transactionIdParamSchema, body: updateTransactionBodySchema }),
  asyncRoute(updateTransaction)
);
router.delete("/transactions/:id", validate({ params: transactionIdParamSchema }), asyncRoute(deleteTransaction));

// ── Command Center & Budget Health ──────────────────────
router.get("/command-center", asyncRoute(getCommandCenter));
router.get("/budget-health", asyncRoute(getBudgetHealth));

// ── Transaction Review Actions ──────────────────────────
router.post("/transactions/:id/approve", validate({ params: transactionIdParamSchema }), asyncRoute(approveTransactionEndpoint));
router.post("/transactions/bulk-approve", asyncRoute(bulkApproveEndpoint));
router.post("/transactions/:id/always-categorize", validate({ params: transactionIdParamSchema }), asyncRoute(alwaysCategorizeEndpoint));

router.post("/goals", validate({ body: createGoalBodySchema }), asyncRoute(createGoal));
router.patch("/goals/:goalId", validate({ params: goalIdParamSchema, body: updateGoalBodySchema }), asyncRoute(updateGoal));
router.delete("/goals/:goalId", validate({ params: goalIdParamSchema }), asyncRoute(deleteGoal));

router.post("/debts", validate({ body: createDebtBodySchema }), asyncRoute(createDebt));
router.patch("/debts/:debtId", validate({ params: debtIdParamSchema, body: updateDebtBodySchema }), asyncRoute(updateDebt));
router.delete("/debts/:debtId", validate({ params: debtIdParamSchema }), asyncRoute(deleteDebt));

export default router;

