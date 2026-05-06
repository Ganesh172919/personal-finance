/**
 * @fileoverview Central v1 API route aggregator. This file defines the bulk of the v1 REST API
 * by mounting many domain-specific route handlers onto a single Express Router.
 *
 * Endpoint groups (all mounted under /api/v1):
 *   Calendar Reminders   - GET/POST/PATCH/DELETE /calendar-reminders
 *   Global Search        - GET /search
 *   Category Rules       - GET/POST/PATCH/DELETE /category-rules (auto-categorization)
 *   Organizations        - GET /orgs/me, POST /orgs, POST /orgs/:orgId/members, PATCH /orgs/:orgId/settings
 *   Org Invites          - POST /org-invites/accept
 *   API Keys             - GET/POST /api-keys, POST /api-keys/:id/revoke
 *   Usage Ledger         - GET /usage/ledger
 *   Billing              - POST /billing/checkout, GET /billing/portal, POST /billing/webhook (Stripe)
 *   Workflows            - GET /workflows/templates, GET/POST /workflows, POST /workflows/:id/run
 *   Finance Accounts     - GET/POST /finance/accounts, PATCH /finance/accounts/:id
 *   Finance Merchants    - GET/POST /finance/merchants
 *   Budget Allocations   - GET/PUT /finance/budgets/:periodKey/allocations, GET .../envelopes
 *   Recurring Rules      - GET /finance/recurring/candidates, GET/POST /finance/recurring, PATCH .../:id
 *   Finance Forecast     - GET /finance/forecast
 *   Exports              - GET/POST /exports, GET /exports/:id, GET /exports/:id/download
 *   Audit Events         - GET /audit/events
 *   Tools                - POST /tools/simulate, POST /tools/execute
 *   AI                   - POST /ai/command, POST /ai/stream, POST /ai/scenario
 *   Autopilot            - POST /autopilot/plan, simulate, approve, execute; GET /autopilot/runs/:id
 *   Events (SSE)         - GET /events/stream
 *   Notifications        - GET /notifications, POST /notifications/:id/read
 *   Marketplace          - GET /marketplace/catalog, POST /marketplace/install
 *   Plugins              - GET /plugins, POST /plugins/:id/update, POST /plugins/:id/uninstall
 *   Integrations         - GET /integrations, connect/disconnect/sync/history per :id
 *   CSV Import           - POST /integrations/transactions_csv/import
 *   Automation Events    - GET /automation/events, POST /automation/events/emit
 *   Feature Flags        - GET/PUT/DELETE /feature-flags/:key
 *   Analytics            - GET /analytics/overview, spending-heatmap, category-trends, income-expense, etc.
 *   Activity Feed        - GET /activity-feed
 *   Comments             - GET/POST/PATCH/DELETE /comments
 *   Shares               - POST /shares/financial-story
 *   Referrals            - GET /referrals/me, POST /referrals/redeem
 *   Two-Factor Auth      - POST /auth/2fa/setup, verify, disable; GET /auth/2fa/status
 *   Security Audit Logs  - GET /security/audit-log, GET /orgs/audit-log
 *   Connector Health     - GET /integrations/health-summary
 *   Plugin Manifest      - POST /plugins/validate-manifest
 *
 * Middleware:
 *   - Passport JWT authentication on nearly all endpoints
 *   - authAny + requireScopeIfApiKey on usage ledger (supports API key auth)
 *   - Zod validation on params, query, and body per endpoint
 *   - CSV file upload (csvUpload) on CSV import endpoint
 *   - Stripe webhook endpoint is unauthenticated (signature verified in controller)
 *
 * Controllers: orgController, apiKeyController, usageController, billingController,
 *   workflowController, exportController, inviteController, auditController, toolController,
 *   featureFlagController, marketplaceController, aiController, integrationController,
 *   automationEventController, analyticsController, shareController, referralController,
 *   notificationController, autopilotController, eventsController, financeAccountsController,
 *   financeMerchantsController, financeBudgetsController, financeRecurringController,
 *   financeIntelligenceController, transactionsCsvImportController, searchController,
 *   categoryRuleController, calendarReminderController, analyticsDetailController,
 *   activityFeedController, commentController, twoFactorController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { authAny, requireScopeIfApiKey } from "../middleware/authAny";
import { objectIdSchema } from "../schemas/common";
import {
  createOrgBodySchema,
  addOrgMemberBodySchema,
  orgIdParamSchema,
  updateOrgSettingsBodySchema,
} from "../schemas/v1/orgSchemas";
import { createApiKeyBodySchema } from "../schemas/v1/apiKeySchemas";
import { usageLedgerQuerySchema } from "../schemas/v1/usageSchemas";
import {
  billingCheckoutBodySchema,
  billingPortalQuerySchema,
} from "../schemas/v1/billingSchemas";
import {
  createWorkflowBodySchema,
  runWorkflowBodySchema,
  workflowIdParamSchema,
} from "../schemas/v1/workflowSchemas";
import {
  createExportBodySchema,
  listExportsQuerySchema,
} from "../schemas/v1/exportSchemas";
import { acceptOrgInviteBodySchema } from "../schemas/v1/inviteSchemas";
import { listAuditEventsQuerySchema } from "../schemas/v1/auditSchemas";
import {
  toolsExecuteBodySchema,
  toolsSimulateBodySchema,
} from "../schemas/v1/toolSchemas";
import {
  listFeatureFlagsQuerySchema,
  featureFlagKeyParamSchema,
  upsertFeatureFlagBodySchema,
} from "../schemas/v1/featureFlagSchemas";
import {
  marketplaceCatalogQuerySchema,
  installMarketplacePluginBodySchema,
  pluginKeyParamSchema,
  updateInstalledPluginBodySchema,
} from "../schemas/v1/marketplaceSchemas";
import {
  integrationConnectBodySchema,
  integrationDisconnectBodySchema,
  integrationHistoryQuerySchema,
  integrationIdParamSchema,
  integrationSyncBodySchema,
} from "../schemas/v1/integrationSchemas";
import { emitAutomationEventBodySchema } from "../schemas/v1/automationEventSchemas";
import { analyticsOverviewQuerySchema } from "../schemas/v1/analyticsSchemas";
import { createFinancialStoryShareBodySchema } from "../schemas/v1/shareSchemas";
import { redeemReferralBodySchema } from "../schemas/v1/referralSchemas";
import { listNotificationsQuerySchema } from "../schemas/v1/notificationSchemas";
import {
  autopilotApproveBodySchema,
  autopilotPlanBodySchema,
  autopilotRunIdBodySchema,
} from "../schemas/v1/autopilotSchemas";
import { transactionsCsvImportBodySchema } from "../schemas/v1/csvImportSchemas";
import {
  forecastQuerySchema,
  recurringCandidatesQuerySchema,
} from "../schemas/v1/financeIntelligenceSchemas";
import {
  processCommandBodySchema,
  whatIfScenarioBodySchema,
} from "../schemas/aiSchemas";
import {
  createOrg,
  listMyOrgs,
  addOrgMember,
  updateOrgSettings,
} from "../controllers/v1/orgController";
import {
  createApiKeyForOrg,
  listApiKeys,
  revokeApiKey,
} from "../controllers/v1/apiKeyController";
import { getUsageLedger } from "../controllers/v1/usageController";
import {
  createBillingPortal,
  createCheckoutSession,
  stripeWebhook,
} from "../controllers/v1/billingController";
import {
  createOrgWorkflow,
  listOrgWorkflows,
  listOrgWorkflowTemplates,
  runOrgWorkflow,
} from "../controllers/v1/workflowController";
import {
  createExport,
  downloadExport,
  getExportById,
  listExports,
} from "../controllers/v1/exportController";
import { acceptInvite } from "../controllers/v1/inviteController";
import { listAuditEvents } from "../controllers/v1/auditController";
import { executeTool, simulateTool } from "../controllers/v1/toolController";
import {
  deleteFeatureFlag,
  listFeatureFlags,
  upsertFeatureFlag,
} from "../controllers/v1/featureFlagController";
import {
  installMarketplacePlugin,
  listInstalledPlugins,
  listMarketplaceCatalog,
  uninstallPlugin,
  updateInstalledPluginVersion,
} from "../controllers/v1/marketplaceController";
import {
  addInvestment,
  getAgentOutputById,
  getAgentOutputs,
  getFinancialProfile,
  getRecentAgentOutputs,
  processAICommand,
  processAiStream,
  processWhatIfScenario,
  submitAgentOutputFeedback,
  updateFinancialProfile,
} from "../controllers/aiController";
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrationHealth,
  getIntegrationHistory,
  listIntegrations,
  syncIntegration,
} from "../controllers/v1/integrationController";
import {
  emitAutomationEvent,
  listAutomationEvents,
} from "../controllers/v1/automationEventController";
import { getAnalyticsOverview } from "../controllers/v1/analyticsController";
import { createFinancialStoryShare } from "../controllers/v1/shareController";
import {
  getMyReferral,
  redeemReferral,
} from "../controllers/v1/referralController";
import {
  listNotifications,
  markNotificationRead,
} from "../controllers/v1/notificationController";
import {
  approveAutopilotRun,
  createAutopilotPlan,
  executeAutopilotRun,
  getAutopilotRun,
  simulateAutopilotRun,
} from "../controllers/v1/autopilotController";
import { streamEvents } from "../controllers/v1/eventsController";
import {
  budgetAllocationUpsertBodySchema,
  createAccountBodySchema,
  createRecurringRuleBodySchema,
  listBudgetAllocationsQuerySchema,
  listMerchantsQuerySchema,
  periodKeyParamSchema,
  updateAccountBodySchema,
  updateRecurringRuleBodySchema,
  upsertMerchantBodySchema,
  recurringRuleIdParamSchema,
} from "../schemas/v1/financeSchemas";
import {
  createAccount,
  listAccounts,
  updateAccount,
} from "../controllers/v1/financeAccountsController";
import {
  listMerchants,
  upsertMerchant,
} from "../controllers/v1/financeMerchantsController";
import {
  listBudgetAllocations,
  upsertBudgetAllocation,
} from "../controllers/v1/financeBudgetsController";
import {
  createRecurringRule,
  listRecurringRules,
  updateRecurringRule,
} from "../controllers/v1/financeRecurringController";
import {
  getBudgetEnvelopesEndpoint,
  getForecastEndpoint,
  listRecurringCandidatesEndpoint,
} from "../controllers/v1/financeIntelligenceController";
import { importTransactionsCsvEndpoint } from "../controllers/v1/transactionsCsvImportController";
import { csvUpload } from "../middleware/uploads";
import { search } from "../controllers/v1/searchController";
import { globalSearchQuerySchema } from "../schemas/v1/searchSchemas";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} from "../controllers/v1/categoryRuleController";
import {
  createCategoryRuleBodySchema,
  updateCategoryRuleBodySchema,
  categoryRuleIdParamSchema,
} from "../schemas/v1/categoryRuleSchemas";
import {
  listReminders,
  createReminder,
  toggleReminder,
  deleteReminder,
} from "../controllers/v1/calendarReminderController";

const router = Router();

// ─── Calendar Reminders ──────────────────────────────────
router.get(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listReminders),
);
router.post(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(createReminder),
);
router.patch(
  "/calendar-reminders/:id/toggle",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(toggleReminder),
);
router.delete(
  "/calendar-reminders/:id",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(deleteReminder),
);

// ─── Global Search ────────────────────────────────────────
router.get(
  "/search",
  passport.authenticate("jwt", { session: false }),
  validate({ query: globalSearchQuerySchema }),
  asyncRoute(search),
);

// ─── Category Rules (auto-categorization) ───────────────
router.get(
  "/category-rules",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listRules),
);
router.post(
  "/category-rules",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCategoryRuleBodySchema }),
  asyncRoute(createRule),
);
router.patch(
  "/category-rules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: categoryRuleIdParamSchema,
    body: updateCategoryRuleBodySchema,
  }),
  asyncRoute(updateRule),
);
router.delete(
  "/category-rules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: categoryRuleIdParamSchema }),
  asyncRoute(deleteRule),
);

router.get(
  "/orgs/me",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listMyOrgs),
);
router.post(
  "/orgs",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createOrgBodySchema }),
  asyncRoute(createOrg),
);
router.post(
  "/orgs/:orgId/members",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: addOrgMemberBodySchema }),
  asyncRoute(addOrgMember),
);
router.patch(
  "/orgs/:orgId/settings",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: updateOrgSettingsBodySchema }),
  asyncRoute(updateOrgSettings),
);

router.post(
  "/org-invites/accept",
  passport.authenticate("jwt", { session: false }),
  validate({ body: acceptOrgInviteBodySchema }),
  asyncRoute(acceptInvite),
);

router.get(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listApiKeys),
);
router.post(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createApiKeyBodySchema }),
  asyncRoute(createApiKeyForOrg),
);
router.post(
  "/api-keys/:id/revoke",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(revokeApiKey),
);

router.get(
  "/usage/ledger",
  authAny,
  requireScopeIfApiKey("usage:read"),
  validate({ query: usageLedgerQuerySchema }),
  asyncRoute(getUsageLedger),
);

router.post(
  "/billing/checkout",
  passport.authenticate("jwt", { session: false }),
  validate({ body: billingCheckoutBodySchema }),
  asyncRoute(createCheckoutSession),
);
router.get(
  "/billing/portal",
  passport.authenticate("jwt", { session: false }),
  validate({ query: billingPortalQuerySchema }),
  asyncRoute(createBillingPortal),
);
router.post("/billing/webhook", asyncRoute(stripeWebhook));

router.get(
  "/workflows/templates",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listOrgWorkflowTemplates),
);
router.get(
  "/workflows",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listOrgWorkflows),
);
router.post(
  "/workflows",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createWorkflowBodySchema }),
  asyncRoute(createOrgWorkflow),
);
router.post(
  "/workflows/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: workflowIdParamSchema, body: runWorkflowBodySchema }),
  asyncRoute(runOrgWorkflow),
);

router.get(
  "/finance/accounts",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listAccounts),
);
router.post(
  "/finance/accounts",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createAccountBodySchema }),
  asyncRoute(createAccount),
);
router.patch(
  "/finance/accounts/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema, body: updateAccountBodySchema }),
  asyncRoute(updateAccount),
);

router.get(
  "/finance/merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listMerchantsQuerySchema }),
  asyncRoute(listMerchants),
);
router.post(
  "/finance/merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ body: upsertMerchantBodySchema }),
  asyncRoute(upsertMerchant),
);

router.get(
  "/finance/budgets/:periodKey/allocations",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: periodKeyParamSchema,
    query: listBudgetAllocationsQuerySchema,
  }),
  asyncRoute(listBudgetAllocations),
);
router.put(
  "/finance/budgets/:periodKey/allocations",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: periodKeyParamSchema,
    body: budgetAllocationUpsertBodySchema,
  }),
  asyncRoute(upsertBudgetAllocation),
);
router.get(
  "/finance/budgets/:periodKey/envelopes",
  passport.authenticate("jwt", { session: false }),
  validate({ params: periodKeyParamSchema }),
  asyncRoute(getBudgetEnvelopesEndpoint),
);

router.get(
  "/finance/recurring/candidates",
  passport.authenticate("jwt", { session: false }),
  validate({ query: recurringCandidatesQuerySchema }),
  asyncRoute(listRecurringCandidatesEndpoint),
);
router.get(
  "/finance/recurring",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listRecurringRules),
);
router.post(
  "/finance/recurring",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createRecurringRuleBodySchema }),
  asyncRoute(createRecurringRule),
);
router.patch(
  "/finance/recurring/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: recurringRuleIdParamSchema,
    body: updateRecurringRuleBodySchema,
  }),
  asyncRoute(updateRecurringRule),
);
router.get(
  "/finance/forecast",
  passport.authenticate("jwt", { session: false }),
  validate({ query: forecastQuerySchema }),
  asyncRoute(getForecastEndpoint),
);

router.get(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listExportsQuerySchema }),
  asyncRoute(listExports),
);
router.post(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createExportBodySchema }),
  asyncRoute(createExport),
);
router.get(
  "/exports/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(getExportById),
);
router.get(
  "/exports/:id/download",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(downloadExport),
);

router.get(
  "/audit/events",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listAuditEventsQuerySchema }),
  asyncRoute(listAuditEvents),
);

router.post(
  "/tools/simulate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsSimulateBodySchema }),
  asyncRoute(simulateTool),
);

router.post(
  "/tools/execute",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsExecuteBodySchema }),
  asyncRoute(executeTool),
);

router.post(
  "/ai/command",
  passport.authenticate("jwt", { session: false }),
  validate({ body: processCommandBodySchema }),
  asyncRoute(processAICommand),
);

router.post(
  "/ai/stream",
  passport.authenticate("jwt", { session: false }),
  validate({ body: processCommandBodySchema }),
  asyncRoute(processAiStream),
);

router.post(
  "/ai/scenario",
  passport.authenticate("jwt", { session: false }),
  validate({ body: whatIfScenarioBodySchema }),
  asyncRoute(processWhatIfScenario),
);

router.post(
  "/autopilot/plan",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotPlanBodySchema }),
  asyncRoute(createAutopilotPlan),
);

router.post(
  "/autopilot/simulate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotRunIdBodySchema }),
  asyncRoute(simulateAutopilotRun),
);

router.post(
  "/autopilot/approve",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotApproveBodySchema }),
  asyncRoute(approveAutopilotRun),
);

router.post(
  "/autopilot/execute",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotRunIdBodySchema }),
  asyncRoute(executeAutopilotRun),
);

router.get(
  "/autopilot/runs/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(getAutopilotRun),
);

router.get(
  "/events/stream",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(streamEvents),
);

router.get(
  "/notifications",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listNotificationsQuerySchema }),
  asyncRoute(listNotifications),
);

router.post(
  "/notifications/:id/read",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(markNotificationRead),
);

router.get(
  "/marketplace/catalog",
  passport.authenticate("jwt", { session: false }),
  validate({ query: marketplaceCatalogQuerySchema }),
  asyncRoute(listMarketplaceCatalog),
);
router.post(
  "/marketplace/install",
  passport.authenticate("jwt", { session: false }),
  validate({ body: installMarketplacePluginBodySchema }),
  asyncRoute(installMarketplacePlugin),
);

router.get(
  "/plugins",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listInstalledPlugins),
);
router.post(
  "/plugins/:id/update",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: pluginKeyParamSchema,
    body: updateInstalledPluginBodySchema,
  }),
  asyncRoute(updateInstalledPluginVersion),
);
router.post(
  "/plugins/:id/uninstall",
  passport.authenticate("jwt", { session: false }),
  validate({ params: pluginKeyParamSchema }),
  asyncRoute(uninstallPlugin),
);

router.get(
  "/integrations",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listIntegrations),
);
router.post(
  "/integrations/transactions_csv/import",
  passport.authenticate("jwt", { session: false }),
  csvUpload().single("file"),
  validate({ body: transactionsCsvImportBodySchema }),
  asyncRoute(importTransactionsCsvEndpoint),
);
router.get(
  "/integrations/:id/health",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema }),
  asyncRoute(getIntegrationHealth),
);
router.post(
  "/integrations/:id/connect",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationConnectBodySchema,
  }),
  asyncRoute(connectIntegration),
);
router.post(
  "/integrations/:id/disconnect",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationDisconnectBodySchema,
  }),
  asyncRoute(disconnectIntegration),
);
router.get(
  "/integrations/:id/history",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    query: integrationHistoryQuerySchema,
  }),
  asyncRoute(getIntegrationHistory),
);
router.post(
  "/integrations/:id/sync",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationSyncBodySchema,
  }),
  asyncRoute(syncIntegration),
);

router.get(
  "/automation/events",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listAutomationEvents),
);
router.post(
  "/automation/events/emit",
  passport.authenticate("jwt", { session: false }),
  validate({ body: emitAutomationEventBodySchema }),
  asyncRoute(emitAutomationEvent),
);

router.get(
  "/feature-flags",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listFeatureFlagsQuerySchema }),
  asyncRoute(listFeatureFlags),
);
router.put(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: featureFlagKeyParamSchema,
    body: upsertFeatureFlagBodySchema,
  }),
  asyncRoute(upsertFeatureFlag),
);
router.delete(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({ params: featureFlagKeyParamSchema }),
  asyncRoute(deleteFeatureFlag),
);

router.get(
  "/analytics/overview",
  passport.authenticate("jwt", { session: false }),
  validate({ query: analyticsOverviewQuerySchema }),
  asyncRoute(getAnalyticsOverview),
);

// ─── Analytics Detail Endpoints ──────────────────────────
import {
  getSpendingHeatmap,
  getCategoryTrends,
  getIncomeExpenseSummary,
  getAccountBalances,
  getTopMerchants,
} from "../controllers/v1/analyticsDetailController";

router.get(
  "/analytics/spending-heatmap",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getSpendingHeatmap),
);
router.get(
  "/analytics/category-trends",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getCategoryTrends),
);
router.get(
  "/analytics/income-expense",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getIncomeExpenseSummary),
);
router.get(
  "/analytics/account-balances",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getAccountBalances),
);
router.get(
  "/analytics/top-merchants",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getTopMerchants),
);

// ─── Activity Feed ───────────────────────────────────────
import { getActivityFeed } from "../controllers/v1/activityFeedController";

router.get(
  "/activity-feed",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getActivityFeed),
);

// ─── Comments ────────────────────────────────────────────
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from "../controllers/v1/commentController";

router.get(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listComments),
);
router.post(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(createComment),
);
router.patch(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(updateComment),
);
router.delete(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(deleteComment),
);

router.post(
  "/shares/financial-story",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createFinancialStoryShareBodySchema }),
  asyncRoute(createFinancialStoryShare),
);

router.get(
  "/referrals/me",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getMyReferral),
);
router.post(
  "/referrals/redeem",
  passport.authenticate("jwt", { session: false }),
  validate({ body: redeemReferralBodySchema }),
  asyncRoute(redeemReferral),
);

// ─── Two-Factor Authentication ────────────────────────────
import {
  setup2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
} from "../controllers/v1/twoFactorController";

router.post(
  "/auth/2fa/setup",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(setup2FA),
);
router.post(
  "/auth/2fa/verify",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(verify2FA),
);
router.post(
  "/auth/2fa/disable",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(disable2FA),
);
router.get(
  "/auth/2fa/status",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(get2FAStatus),
);

// ─── Security Audit Logs ─────────────────────────────────
import { getUserAuditLog, getOrgAuditLog } from "../services/auditService";

router.get(
  "/security/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(async (req: any, res: any) => {
    const userId = req.user?._id;
    if (!userId)
      return res
        .status(401)
        .json({
          message: "Unauthorized",
          code: "UNAUTHORIZED",
          request_id: req.requestId,
        });

    const limit = Math.min(parseInt(req.query?.limit || "50", 10) || 50, 200);
    const actions = req.query?.actions
      ? String(req.query.actions).split(",")
      : undefined;
    const logs = await getUserAuditLog(userId, {
      limit,
      actions: actions as any,
    });

    res.json({ audit_log: logs, request_id: req.requestId });
  }),
);

router.get(
  "/orgs/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(async (req: any, res: any) => {
    const orgId = req.org?.orgId;
    if (!orgId)
      return res
        .status(400)
        .json({
          message: "Organization context required",
          code: "MISSING_ORG_CONTEXT",
          request_id: req.requestId,
        });

    const limit = Math.min(parseInt(req.query?.limit || "100", 10) || 100, 500);
    const severity = req.query?.severity;
    const logs = await getOrgAuditLog(orgId, { limit, severity });

    res.json({ audit_log: logs, request_id: req.requestId });
  }),
);

// ─── Connector Health ────────────────────────────────────
import { getConnectorHealthSummary } from "../services/connectorHealth";
import mongoose from "mongoose";

router.get(
  "/integrations/health-summary",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(async (req: any, res: any) => {
    const orgId = req.org?.orgId;
    if (!orgId)
      return res
        .status(400)
        .json({
          message: "Organization context required",
          code: "MISSING_ORG_CONTEXT",
          request_id: req.requestId,
        });

    const summary = await getConnectorHealthSummary(
      new mongoose.Types.ObjectId(String(orgId)),
    );
    res.json({ connectors: summary, request_id: req.requestId });
  }),
);

// ─── Plugin Manifest Validation ──────────────────────────
import { validatePluginManifest } from "../modules/plugins/permissionMiddleware";

router.post(
  "/plugins/validate-manifest",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(validatePluginManifest),
);

export default router;
