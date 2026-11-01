/**
 * @fileoverview Central v1 API route aggregator. This file defines the bulk of the v1 REST API
 * by mounting many domain-specific route handlers onto a single Express Router.
 *
 * Sub-route modules (mounted via router.use):
 *   analyticsRoutes      - /analytics/* detail endpoints
 *   automationRoutes     - /workflows, /autopilot, /automation/events, /category-rules
 *   securityRoutes       - /auth/2fa/*, /security/audit-log, /orgs/audit-log, /api-keys
 *   collaborationRoutes  - /comments, /activity-feed, /shares, /org-invites
 *
 * Endpoint groups remaining here (all mounted under /api/v1):
 *   Calendar Reminders   - GET/POST/PATCH/DELETE /calendar-reminders
 *   Global Search        - GET /search
 *   Organizations        - GET /orgs/me, POST /orgs, POST /orgs/:orgId/members, PATCH /orgs/:orgId/settings
 *   Usage Ledger         - GET /usage/ledger
 *   Billing              - POST /billing/checkout, GET /billing/portal, POST /billing/webhook (Stripe)
 *   Finance Accounts     - GET/POST /finance/accounts, PATCH /finance/accounts/:id
 *   Finance Merchants    - GET/POST /finance/merchants
 *   Budget Allocations   - GET/PUT /finance/budgets/:periodKey/allocations, GET .../envelopes
 *   Recurring Rules      - GET /finance/recurring/candidates, GET/POST /finance/recurring, PATCH .../:id
 *   Finance Forecast     - GET /finance/forecast
 *   Exports              - GET/POST /exports, GET /exports/:id, GET /exports/:id/download
 *   Audit Events         - GET /audit/events
 *   Tools                - POST /tools/simulate, POST /tools/execute
 *   AI                   - POST /ai/command, POST /ai/stream, POST /ai/scenario
 *   Events (SSE)         - GET /events/stream
 *   Notifications        - GET /notifications, POST /notifications/:id/read
 *   Marketplace          - GET /marketplace/catalog, POST /marketplace/install
 *   Plugins              - GET /plugins, POST /plugins/:id/update, POST /plugins/:id/uninstall
 *   Integrations         - GET /integrations, connect/disconnect/sync/history per :id
 *   CSV Import           - POST /integrations/transactions_csv/import
 *   Feature Flags        - GET/PUT/DELETE /feature-flags/:key
 *   Analytics Overview   - GET /analytics/overview
 *   Referrals            - GET /referrals/me, POST /referrals/redeem
 *   Connector Health     - GET /integrations/health-summary
 *   Plugin Manifest      - POST /plugins/validate-manifest
 *
 * Middleware:
 *   - Passport JWT authentication on nearly all endpoints
 *   - authAny + requireScopeIfApiKey on usage ledger (supports API key auth)
 *   - Zod validation on params, query, and body per endpoint
 *   - CSV file upload (csvUpload) on CSV import endpoint
 *   - Stripe webhook endpoint is unauthenticated (signature verified in controller)
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
import { usageLedgerQuerySchema } from "../schemas/v1/usageSchemas";
import {
  billingCheckoutBodySchema,
  billingPortalQuerySchema,
  purchaseCreditsBodySchema,
  simulateDunningFailureBodySchema,
  listInvoicesQuerySchema,
} from "../schemas/v1/billingSchemas";
import {
  createExportBodySchema,
  listExportsQuerySchema,
} from "../schemas/v1/exportSchemas";
import {
  createScheduledExportBodySchema,
  updateScheduledExportBodySchema,
} from "../schemas/v1/scheduledExportSchemas";
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
import { analyticsOverviewQuerySchema } from "../schemas/v1/analyticsSchemas";
import {
  listCalendarRemindersQuerySchema,
  createCalendarReminderBodySchema,
  calendarReminderIdParamSchema,
} from "../schemas/v1/calendarReminderSchemas";
import { redeemReferralBodySchema } from "../schemas/v1/referralSchemas";
import { listNotificationsQuerySchema } from "../schemas/v1/notificationSchemas";
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
import { getUsageLedger } from "../controllers/v1/usageController";
import {
  createBillingPortal,
  createCheckoutSession,
  downloadInvoicePdf,
  listInvoices,
  purchaseCreditPack,
  stripeWebhook,
  getDunningStatus,
  retryDunningPayment,
  simulateDunningPaymentFailure,
} from "../controllers/v1/billingController";
import {
  createExport,
  downloadExport,
  getExportById,
  listExports,
} from "../controllers/v1/exportController";
import {
  createScheduledExport,
  deleteScheduledExport,
  listScheduledExports,
  triggerScheduledExportNow,
  updateScheduledExport,
} from "../controllers/v1/scheduledExportController";
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
  getConnectorHealthSummaryEndpoint,
  getIntegrationHealth,
  getIntegrationHistory,
  listIntegrations,
  syncIntegration,
} from "../controllers/v1/integrationController";
import { getAnalyticsOverview } from "../controllers/v1/analyticsController";
import {
  getMyReferral,
  redeemReferral,
} from "../controllers/v1/referralController";
import {
  listNotifications,
  markNotificationRead,
} from "../controllers/v1/notificationController";
import { streamEvents } from "../controllers/v1/eventsController";
import {
  budgetAllocationUpsertBodySchema,
  budgetAllocationIdParamSchema,
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
  deleteBudgetAllocation,
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
  listReminders,
  createReminder,
  toggleReminder,
  deleteReminder,
} from "../controllers/v1/calendarReminderController";
import { validatePluginManifest } from "../modules/plugins/permissionMiddleware";

// ─── Sub-route modules ───────────────────────────────────
import analyticsRoutes from "./v1/analyticsRoutes";
import automationRoutes from "./v1/automationRoutes";
import securityRoutes from "./v1/securityRoutes";
import collaborationRoutes from "./v1/collaborationRoutes";

const router = Router();

// Mount sub-routes
router.use("/", analyticsRoutes);
router.use("/", automationRoutes);
router.use("/", securityRoutes);
router.use("/", collaborationRoutes);

// ─── Calendar Reminders ──────────────────────────────────
router.get(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listCalendarRemindersQuerySchema }),
  asyncRoute(listReminders),
);
router.post(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCalendarReminderBodySchema }),
  asyncRoute(createReminder),
);
router.patch(
  "/calendar-reminders/:id/toggle",
  passport.authenticate("jwt", { session: false }),
  validate({ params: calendarReminderIdParamSchema }),
  asyncRoute(toggleReminder),
);
router.delete(
  "/calendar-reminders/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: calendarReminderIdParamSchema }),
  asyncRoute(deleteReminder),
);

// ─── Global Search ────────────────────────────────────────
router.get(
  "/search",
  passport.authenticate("jwt", { session: false }),
  validate({ query: globalSearchQuerySchema }),
  asyncRoute(search),
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
router.post(
  "/billing/credits",
  passport.authenticate("jwt", { session: false }),
  validate({ body: purchaseCreditsBodySchema }),
  asyncRoute(purchaseCreditPack),
);
router.post("/billing/webhook", asyncRoute(stripeWebhook));
router.get(
  "/billing/invoices",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listInvoicesQuerySchema }),
  asyncRoute(listInvoices),
);
router.get(
  "/billing/invoices/:id/pdf",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(downloadInvoicePdf),
);
router.get(
  "/billing/dunning",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getDunningStatus),
);
router.post(
  "/billing/dunning/retry",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(retryDunningPayment),
);
router.post(
  "/billing/dunning/simulate-failure",
  passport.authenticate("jwt", { session: false }),
  validate({ body: simulateDunningFailureBodySchema }),
  asyncRoute(simulateDunningPaymentFailure),
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
router.delete(
  "/finance/budgets/:periodKey/allocations/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: budgetAllocationIdParamSchema,
  }),
  asyncRoute(deleteBudgetAllocation),
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
  "/exports/schedules",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listScheduledExports),
);
router.post(
  "/exports/schedules",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createScheduledExportBodySchema }),
  asyncRoute(createScheduledExport),
);
router.patch(
  "/exports/schedules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema, body: updateScheduledExportBodySchema }),
  asyncRoute(updateScheduledExport),
);
router.delete(
  "/exports/schedules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(deleteScheduledExport),
);
router.post(
  "/exports/schedules/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(triggerScheduledExportNow),
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

// ─── Connector Health ────────────────────────────────────
router.get(
  "/integrations/health-summary",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getConnectorHealthSummaryEndpoint),
);

// ─── Plugin Manifest Validation ──────────────────────────
router.post(
  "/plugins/validate-manifest",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(validatePluginManifest),
);

export default router;
