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
  bulkDeleteEndpoint,
  bulkCategorizeEndpoint,
  alwaysCategorizeEndpoint,
  getMerchantClusters,
  applyMerchantCluster,
  ingestBankFeedWebhook,
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
  updateTransactionBodySchema,
  getMerchantClustersQuerySchema,
  applyMerchantClusterBodySchema,
  bankFeedWebhookBodySchema,
} from "../schemas/financialDataSchemas";
import {
  commandCenterQuerySchema,
  budgetHealthQuerySchema,
  bulkApproveBodySchema,
  bulkDeleteBodySchema,
  bulkCategorizeBodySchema,
} from "../schemas/v1/commandCenterSchemas";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes Express router instance for managing core financial records.
// Serves transaction logs, budget summaries, debt ledgers, and savings goals.
// Applies JWT authentication and schema validation across all mounted paths.
const router = Router();

// Enforces mandatory JWT authentication on all incoming financial routes.
// Extracts authenticated user context and attaches it to request object.
// Blocks unverified callers with 401 Unauthorized status responses.
router.use(passport.authenticate("jwt", { session: false }));

// Records a new individual financial transaction entry in the database.
// Validates date, category, amount, currency, and merchant body fields.
// Passes transaction creation to createTransaction controller handler.
router.post("/transactions", validate({ body: createTransactionBodySchema }), asyncRoute(createTransaction));

// Ingests multiple financial transaction records in a single bulk batch.
// Validates array format and individual item schemas against constraints.
// Executes batch insertion through importTransactions controller logic.
router.post("/transactions/import", validate({ body: importTransactionsBodySchema }), asyncRoute(importTransactions));

// Retrieves a chronological list of recent user transaction activities.
// Validates query parameters such as record count limits and category filters.
// Invokes listRecentTransactions controller returning latest ledger entries.
router.get("/transactions/recent", validate({ query: recentTransactionsQuerySchema }), asyncRoute(listRecentTransactions));

// Computes aggregated transaction totals and statistics within date windows.
// Validates date range boundaries and currency conversion query parameters.
// Calls getTransactionsSummary controller returning calculated metrics.
router.get("/transactions/summary", validate({ query: transactionsSummaryQuerySchema }), asyncRoute(getTransactionsSummary));

// Fetches high-level financial overview metrics for primary dashboard display.
// Validates time period query parameters and user account filtering rules.
// Invokes getDashboardSummary controller returning consolidated metrics.
router.get("/dashboard/summary", validate({ query: dashboardSummaryQuerySchema }), asyncRoute(getDashboardSummary));

// Formulates investment portfolio summaries, asset classes, and valuations.
// Validates query parameters including month range and valuation currencies.
// Passes request handling to getPortfolioSummary controller handler.
router.get("/portfolio/summary", validate({ query: portfolioSummaryQuerySchema }), asyncRoute(getPortfolioSummary));

// Queries paginated financial transactions matching multifaceted filter rules.
// Validates query filters for category, amount ranges, dates, and search terms.
// Dispatches query execution to listTransactions controller handler.
router.get("/transactions", validate({ query: listTransactionsQuerySchema }), asyncRoute(listTransactions));

// Modifies fields or classification details of an existing transaction record.
// Validates transaction ID parameter and updateTransactionBodySchema fields.
// Calls updateTransaction controller to persist modifications to database.
router.patch(
  "/transactions/:id",
  validate({ params: transactionIdParamSchema, body: updateTransactionBodySchema }),
  asyncRoute(updateTransaction)
);

// Permanently removes a transaction record from the user financial ledger.
// Validates path parameter schema against transactionIdParamSchema rules.
// Dispatches deletion operation via deleteTransaction controller handler.
router.delete("/transactions/:id", validate({ params: transactionIdParamSchema }), asyncRoute(deleteTransaction));

// ── Merchant Clustering & authenticated Bank Feed Simulator Import ─────────────
// Discovers semantic clustering groups across raw merchant names and aliases.
// Validates query criteria including clustering threshold and date intervals.
// Invokes getMerchantClusters controller returning normalized merchant sets.
router.get(
  "/transactions/merchant-clusters",
  validate({ query: getMerchantClustersQuerySchema }),
  asyncRoute(getMerchantClusters)
);

// Applies batch normalization rules across transactions matching a cluster.
// Validates target merchant cluster identifier and canonical name mapping.
// Commits bulk merchant updates via applyMerchantCluster controller logic.
router.post(
  "/transactions/merchant-clusters/apply",
  validate({ body: applyMerchantClusterBodySchema }),
  asyncRoute(applyMerchantCluster)
);

// Ingests simulated or live bank feed transaction webhook notifications.
// Validates webhook payload schema against bankFeedWebhookBodySchema rules.
// Hands feed ingestion over to ingestBankFeedWebhook controller handler.
router.post(
  "/transactions/bank-feed",
  validate({ body: bankFeedWebhookBodySchema }),
  asyncRoute(ingestBankFeedWebhook)
);

// ── Command Center & Budget Health ──────────────────────
// Assembles command center telemetry including pending tasks and anomalies.
// Validates query parameters for dashboard scope and refresh intervals.
// Invokes getCommandCenter controller returning prioritized action items.
router.get("/command-center", validate({ query: commandCenterQuerySchema }), asyncRoute(getCommandCenter));

// Evaluates budget consumption rates and computes health score indicators.
// Validates query parameters determining evaluation window and threshold bounds.
// Calls getBudgetHealth controller returning diagnostic budget status.
router.get("/budget-health", validate({ query: budgetHealthQuerySchema }), asyncRoute(getBudgetHealth));

// ── Transaction Review Actions ──────────────────────────
// Approves a pending or flagged transaction record into active ledger.
// Validates transaction ID parameter and verifies caller ownership rights.
// Invokes approveTransactionEndpoint controller to mark item as approved.
router.post("/transactions/:id/approve", validate({ params: transactionIdParamSchema }), asyncRoute(approveTransactionEndpoint));

// Executes bulk approval across multiple queued transaction records at once.
// Validates array of transaction identifiers in bulkApproveBodySchema.
// Passes bulk approval processing to bulkApproveEndpoint controller handler.
router.post("/transactions/bulk-approve", validate({ body: bulkApproveBodySchema }), asyncRoute(bulkApproveEndpoint));

// Deletes a batch collection of selected transaction entries permanently.
// Validates target transaction IDs array against bulkDeleteBodySchema constraints.
// Executes bulk deletion via bulkDeleteEndpoint controller handler.
router.post("/transactions/bulk-delete", validate({ body: bulkDeleteBodySchema }), asyncRoute(bulkDeleteEndpoint));

// Reassigns expense category classifications across multiple transactions.
// Validates transaction ID array and target category in request payload.
// Commits categorization updates through bulkCategorizeEndpoint controller.
router.post("/transactions/bulk-categorize", validate({ body: bulkCategorizeBodySchema }), asyncRoute(bulkCategorizeEndpoint));

// Creates an automated categorization rule derived from a specific transaction.
// Validates target transaction ID parameter and extracts merchant mapping.
// Invokes alwaysCategorizeEndpoint controller to register categorization rule.
router.post("/transactions/:id/always-categorize", validate({ params: transactionIdParamSchema }), asyncRoute(alwaysCategorizeEndpoint));

// Creates a new financial savings or investment goal target in the system.
// Validates target amount, target date, and goal category body schema.
// Commits goal creation through createGoal controller inside asyncRoute.
router.post("/goals", validate({ body: createGoalBodySchema }), asyncRoute(createGoal));

// Updates progress, target amounts, or target deadlines of a financial goal.
// Validates goalId path parameter and updateGoalBodySchema fields.
// Calls updateGoal controller to apply modifications to the database.
router.patch("/goals/:goalId", validate({ params: goalIdParamSchema, body: updateGoalBodySchema }), asyncRoute(updateGoal));

// Removes a financial goal record and deletes its tracking milestones.
// Validates goalId parameter schema against database identifier rules.
// Dispatches goal deletion via deleteGoal controller handler.
router.delete("/goals/:goalId", validate({ params: goalIdParamSchema }), asyncRoute(deleteGoal));

// Registers a new liability or debt obligation record for debt payoff tracking.
// Validates principal amount, interest rate, minimum payment, and lender schema.
// Commits debt record creation through createDebt controller handler.
router.post("/debts", validate({ body: createDebtBodySchema }), asyncRoute(createDebt));

// Modifies balance, interest rate, or status flags of an existing debt.
// Validates debtId parameter and updateDebtBodySchema payload fields.
// Calls updateDebt controller to persist changes to the database.
router.patch("/debts/:debtId", validate({ params: debtIdParamSchema, body: updateDebtBodySchema }), asyncRoute(updateDebt));

// Deletes a debt record from the payoff planner and ledger database.
// Validates debtId path parameter schema and ensures caller ownership.
// Invokes deleteDebt controller to delete debt entry from database.
router.delete("/debts/:debtId", validate({ params: debtIdParamSchema }), asyncRoute(deleteDebt));

// Exports configured financial data router instance as module default export.
// Mounts into main Express application providing transaction and goal routes.
// Exposes complete REST interface for core financial management features.
export default router;
