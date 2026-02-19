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
  updateTransaction
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

router.post("/goals", validate({ body: createGoalBodySchema }), asyncRoute(createGoal));
router.patch("/goals/:goalId", validate({ params: goalIdParamSchema, body: updateGoalBodySchema }), asyncRoute(updateGoal));
router.delete("/goals/:goalId", validate({ params: goalIdParamSchema }), asyncRoute(deleteGoal));

router.post("/debts", validate({ body: createDebtBodySchema }), asyncRoute(createDebt));
router.patch("/debts/:debtId", validate({ params: debtIdParamSchema, body: updateDebtBodySchema }), asyncRoute(updateDebt));
router.delete("/debts/:debtId", validate({ params: debtIdParamSchema }), asyncRoute(deleteDebt));

export default router;
