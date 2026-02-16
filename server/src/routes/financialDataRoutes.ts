import { Router } from "express";
import passport from "passport";
import {
  createDebt,
  createGoal,
  createTransaction,
  deleteDebt,
  deleteGoal,
  deleteTransaction,
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
  debtIdParamSchema,
  goalIdParamSchema,
  recentTransactionsQuerySchema,
  listTransactionsQuerySchema,
  transactionsSummaryQuerySchema,
  transactionIdParamSchema,
  updateDebtBodySchema,
  updateGoalBodySchema,
  updateTransactionBodySchema
} from "../schemas/financialDataSchemas";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post("/transactions", validate({ body: createTransactionBodySchema }), createTransaction);
router.get("/transactions/recent", validate({ query: recentTransactionsQuerySchema }), listRecentTransactions);
router.get("/transactions/summary", validate({ query: transactionsSummaryQuerySchema }), getTransactionsSummary);
router.get("/transactions", validate({ query: listTransactionsQuerySchema }), listTransactions);
router.patch(
  "/transactions/:id",
  validate({ params: transactionIdParamSchema, body: updateTransactionBodySchema }),
  updateTransaction
);
router.delete("/transactions/:id", validate({ params: transactionIdParamSchema }), deleteTransaction);

router.post("/goals", validate({ body: createGoalBodySchema }), createGoal);
router.patch("/goals/:goalId", validate({ params: goalIdParamSchema, body: updateGoalBodySchema }), updateGoal);
router.delete("/goals/:goalId", validate({ params: goalIdParamSchema }), deleteGoal);

router.post("/debts", validate({ body: createDebtBodySchema }), createDebt);
router.patch("/debts/:debtId", validate({ params: debtIdParamSchema, body: updateDebtBodySchema }), updateDebt);
router.delete("/debts/:debtId", validate({ params: debtIdParamSchema }), deleteDebt);

export default router;
