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
  batchCalendarRemindersBodySchema,
} from "../schemas/v1/calendarReminderSchemas";
import { redeemReferralBodySchema } from "../schemas/v1/referralSchemas";
import { listNotificationsQuerySchema } from "../schemas/v1/notificationSchemas";
import { transactionsCsvImportBodySchema } from "../schemas/v1/csvImportSchemas";
import {
  forecastQuerySchema,
  recurringCandidatesQuerySchema,
  budgetEnvelopesQuerySchema,
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
  getCanaryStatusHandler,
  validateCanaryInvariantsHandler,
  runCanaryProbesHandler,
} from "../controllers/v1/aiCanaryController";
import {
  canaryValidateBodySchema,
  canaryRunProbesBodySchema,
} from "../schemas/v1/aiCanarySchemas";
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
  rebalanceBudgetAllocationsBodySchema,
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
  rebalanceBudgetAllocations,
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
import { getUnifiedContext, postUnifiedContext } from "../controllers/v1/unifiedContextController";
import { unifiedContextQuerySchema, unifiedContextBodySchema } from "../schemas/v1/unifiedContextSchemas";
import {
  getRecommendationsHandler,
  recordFeedbackHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
} from "../controllers/v1/followThroughController";
import {
  getRecommendationsQuerySchema,
  recordFeedbackBodySchema,
  updatePreferencesBodySchema,
} from "../schemas/v1/followThroughSchemas";
import {
  listReminders,
  createReminder,
  toggleReminder,
  deleteReminder,
  batchCompleteReminders,
  clearCompletedReminders,
} from "../controllers/v1/calendarReminderController";
import { validatePluginManifest } from "../modules/plugins/permissionMiddleware";

// ─── Sub-route modules ───────────────────────────────────
import analyticsRoutes from "./v1/analyticsRoutes";
import automationRoutes from "./v1/automationRoutes";
import securityRoutes from "./v1/securityRoutes";
import collaborationRoutes from "./v1/collaborationRoutes";
import deadLetterJobRoutes from "./v1/deadLetterJobRoutes";

// Instantiates central Express router for aggregate v1 routes.
// Registers domain modules, authentication, and validation layers.
// Acts as primary dispatch nexus for core financial capabilities.
const router = Router();

// Mounts domain-specific sub-route modules into root router hierarchy.
// Integrates analytics, automation, security, and team collaboration.
// Preserves clean separation across specialized endpoint domains.
// Mount sub-routes
router.use("/", analyticsRoutes);
router.use("/", automationRoutes);
router.use("/", securityRoutes);
router.use("/", collaborationRoutes);
router.use("/", deadLetterJobRoutes);

// ─── Calendar Reminders ──────────────────────────────────
// Queries scheduled calendar reminders within specified date boundaries.
// Applies user authentication and validates query parameter schemas.
// Calls listReminders controller returning structured event payloads.
router.get(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listCalendarRemindersQuerySchema }),
  asyncRoute(listReminders),
);

// Creates a new financial or task calendar reminder entry.
// Validates request body schema against createCalendarReminder constraints.
// Executes createReminder controller within asynchronous error wrapper.
router.post(
  "/calendar-reminders",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCalendarReminderBodySchema }),
  asyncRoute(createReminder),
);

// Marks a batch collection of calendar reminder records as completed.
// Validates batch IDs array schema before committing status changes.
// Invokes batchCompleteReminders controller for bulk execution.
router.post(
  "/calendar-reminders/batch-complete",
  passport.authenticate("jwt", { session: false }),
  validate({ body: batchCalendarRemindersBodySchema }),
  asyncRoute(batchCompleteReminders),
);

// Clears all completed calendar reminder records from the system.
// Validates purge constraints and confirms authenticated user permissions.
// Calls clearCompletedReminders controller to delete finished records.
router.post(
  "/calendar-reminders/clear-completed",
  passport.authenticate("jwt", { session: false }),
  validate({ body: batchCalendarRemindersBodySchema }),
  asyncRoute(clearCompletedReminders),
);

// Toggles completion or active status of a specified calendar reminder.
// Validates target reminder ID parameter and verifies caller ownership.
// Invokes toggleReminder controller to flip reminder state.
router.patch(
  "/calendar-reminders/:id/toggle",
  passport.authenticate("jwt", { session: false }),
  validate({ params: calendarReminderIdParamSchema }),
  asyncRoute(toggleReminder),
);

// Permanently deletes an individual calendar reminder record by ID.
// Validates path parameter schema and ensures JWT authentication context.
// Delegates deletion logic to deleteReminder controller handler.
router.delete(
  "/calendar-reminders/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: calendarReminderIdParamSchema }),
  asyncRoute(deleteReminder),
);

// ─── Global Search ────────────────────────────────────────
// Performs cross-cutting global search across transactions, accounts, and docs.
// Validates query parameters such as keyword search terms and entity filters.
// Invokes search controller inside asynchronous route error wrapper.
router.get(
  "/search",
  passport.authenticate("jwt", { session: false }),
  validate({ query: globalSearchQuerySchema }),
  asyncRoute(search),
);

// ─── Unified Context Search ──────────────────────────────
// Retrieves unified user financial context and synthesized semantic profile.
// Validates query filters for context breadth and historical depth.
// Hands request to getUnifiedContext controller for profile retrieval.
router.get(
  "/search/unified-context",
  passport.authenticate("jwt", { session: false }),
  validate({ query: unifiedContextQuerySchema }),
  asyncRoute(getUnifiedContext),
);

// Ingests real-time signals into the unified financial context knowledge graph.
// Validates incoming signal body schema against unifiedContextBodySchema.
// Commits event updates via postUnifiedContext controller execution.
router.post(
  "/search/unified-context",
  passport.authenticate("jwt", { session: false }),
  validate({ body: unifiedContextBodySchema }),
  asyncRoute(postUnifiedContext),
);

// ─── Personalized Follow-Through ─────────────────────────
// Generates contextual action recommendations based on user engagement patterns.
// Validates query parameters and enforces active user authentication.
// Invokes getRecommendationsHandler to retrieve priority recommendations.
router.get(
  "/follow-through/recommendations",
  passport.authenticate("jwt", { session: false }),
  validate({ query: getRecommendationsQuerySchema }),
  asyncRoute(getRecommendationsHandler),
);

// Records user interaction feedback on recommended follow-through items.
// Validates feedback payload schema including action type and sentiment.
// Dispatches feedback processing to recordFeedbackHandler controller.
router.post(
  "/follow-through/feedback",
  passport.authenticate("jwt", { session: false }),
  validate({ body: recordFeedbackBodySchema }),
  asyncRoute(recordFeedbackHandler),
);

// Fetches user preference configuration for personalized follow-through prompts.
// Enforces JWT user authentication without requiring request body.
// Invokes getPreferencesHandler to retrieve active user configurations.
router.get(
  "/follow-through/preferences",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getPreferencesHandler),
);

// Modifies or replaces user follow-through preference configurations.
// Validates updated frequency, channel, and topic preference payload schemas.
// Calls updatePreferencesHandler to persist user setting changes.
router.put(
  "/follow-through/preferences",
  passport.authenticate("jwt", { session: false }),
  validate({ body: updatePreferencesBodySchema }),
  asyncRoute(updatePreferencesHandler),
);

// Lists all organizations where authenticated user maintains active membership.
// Verifies user session authentication via passport JWT strategy.
// Dispatches organization enumeration via listMyOrgs controller.
router.get(
  "/orgs/me",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listMyOrgs),
);

// Provisions a newly registered organization with caller set as owner.
// Validates organization creation schema including legal name and currency.
// Invokes createOrg controller to persist organization record.
router.post(
  "/orgs",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createOrgBodySchema }),
  asyncRoute(createOrg),
);

// Enrolls a new team member into the specified organization workspace.
// Validates organization ID route parameter and member assignment schema.
// Hands request over to addOrgMember controller for membership setup.
router.post(
  "/orgs/:orgId/members",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: addOrgMemberBodySchema }),
  asyncRoute(addOrgMember),
);

// Modifies configuration settings and operational policies for an organization.
// Validates orgId parameter and updates settings payload schema.
// Commits organizational updates using updateOrgSettings controller.
router.patch(
  "/orgs/:orgId/settings",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: updateOrgSettingsBodySchema }),
  asyncRoute(updateOrgSettings),
);

// Retrieves system resource and token consumption records from usage ledger.
// Supports both JWT session and API key auth with usage:read permission scope.
// Delegates query processing to getUsageLedger controller handler.
router.get(
  "/usage/ledger",
  authAny,
  requireScopeIfApiKey("usage:read"),
  validate({ query: usageLedgerQuerySchema }),
  asyncRoute(getUsageLedger),
);

// Initiates a Stripe checkout session for subscription tier upgrade.
// Validates plan tier and success/cancel redirection URLs in body payload.
// Passes session creation to createCheckoutSession controller handler.
router.post(
  "/billing/checkout",
  passport.authenticate("jwt", { session: false }),
  validate({ body: billingCheckoutBodySchema }),
  asyncRoute(createCheckoutSession),
);

// Generates an authenticated Stripe customer billing portal session URL.
// Validates return URL query parameter schema before initiating portal.
// Invokes createBillingPortal controller to obtain external access link.
router.get(
  "/billing/portal",
  passport.authenticate("jwt", { session: false }),
  validate({ query: billingPortalQuerySchema }),
  asyncRoute(createBillingPortal),
);

// Executes purchase and allocation of on-demand AI processing credit packs.
// Validates requested pack size and pricing tier from request body.
// Invokes purchaseCreditPack controller for billing and balance top-up.
router.post(
  "/billing/credits",
  passport.authenticate("jwt", { session: false }),
  validate({ body: purchaseCreditsBodySchema }),
  asyncRoute(purchaseCreditPack),
);

// Handles incoming unauthenticated asynchronous webhook events from Stripe.
// Verifies Stripe cryptographic webhook signature directly inside handler.
// Calls stripeWebhook controller to synchronize subscription and invoice state.
router.post("/billing/webhook", asyncRoute(stripeWebhook));

// Lists historical billing invoices associated with active account.
// Validates pagination and status query filter schemas.
// Calls listInvoices controller returning paginated invoice summaries.
router.get(
  "/billing/invoices",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listInvoicesQuerySchema }),
  asyncRoute(listInvoices),
);

// Generates and streams PDF download of a specific invoice document.
// Enforces user session authentication and verifies invoice record access.
// Invokes downloadInvoicePdf controller returning binary file stream.
router.get(
  "/billing/invoices/:id/pdf",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(downloadInvoicePdf),
);

// Retrieves current billing retry status and dunning lifecycle state.
// Verifies authenticated user session and checks for failed payments.
// Dispatches status inspection via getDunningStatus controller.
router.get(
  "/billing/dunning",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getDunningStatus),
);

// Manually triggers payment retry for overdue dunning billing cycle.
// Verifies caller identity and attempts immediate payment re-collection.
// Calls retryDunningPayment controller returning retry operation outcome.
router.post(
  "/billing/dunning/retry",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(retryDunningPayment),
);

// Simulates payment failures during development and end-to-end testing.
// Validates failure scenario payload schema and checks sandbox environment.
// Dispatches simulated failure event to simulateDunningPaymentFailure controller.
router.post(
  "/billing/dunning/simulate-failure",
  passport.authenticate("jwt", { session: false }),
  validate({ body: simulateDunningFailureBodySchema }),
  asyncRoute(simulateDunningPaymentFailure),
);

// Lists financial accounts belonging to current authenticated user.
// Enforces JWT user authentication without requiring query parameters.
// Invokes listAccounts controller to aggregate connected institution accounts.
router.get(
  "/finance/accounts",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listAccounts),
);

// Registers a newly linked or manual financial account in the system.
// Validates account name, institution, balance, and account type schema.
// Commits new account creation through createAccount controller handler.
router.post(
  "/finance/accounts",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createAccountBodySchema }),
  asyncRoute(createAccount),
);

// Updates details, balances, or display properties of an existing account.
// Validates account ID parameter and updateAccountBodySchema fields.
// Calls updateAccount controller to persist changes to the database.
router.patch(
  "/finance/accounts/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema, body: updateAccountBodySchema }),
  asyncRoute(updateAccount),
);

// Lists registered merchants matched by query parameters and search filters.
// Validates merchant listing query parameters including name and category.
// Dispatches merchant query retrieval via listMerchants controller.
router.get(
  "/finance/merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listMerchantsQuerySchema }),
  asyncRoute(listMerchants),
);

// Creates or updates custom merchant categorization and metadata mapping.
// Validates merchant upsert payload schema including normalized alias names.
// Invokes upsertMerchant controller to record merchant configurations.
router.post(
  "/finance/merchants",
  passport.authenticate("jwt", { session: false }),
  validate({ body: upsertMerchantBodySchema }),
  asyncRoute(upsertMerchant),
);

// Retrieves category budget allocations for a specific fiscal calendar period.
// Validates periodKey path parameter and query criteria schemas.
// Calls listBudgetAllocations controller returning assigned envelope quotas.
router.get(
  "/finance/budgets/:periodKey/allocations",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: periodKeyParamSchema,
    query: listBudgetAllocationsQuerySchema,
  }),
  asyncRoute(listBudgetAllocations),
);

// Upserts monthly budget allocation amounts across expense categories.
// Validates periodKey parameter and allocation payload amounts schema.
// Invokes upsertBudgetAllocation controller to write budget records.
router.put(
  "/finance/budgets/:periodKey/allocations",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: periodKeyParamSchema,
    body: budgetAllocationUpsertBodySchema,
  }),
  asyncRoute(upsertBudgetAllocation),
);

// Removes an existing budget allocation assigned to a financial period.
// Validates budget allocation record identifier path parameter.
// Calls deleteBudgetAllocation controller to delete entry from database.
router.delete(
  "/finance/budgets/:periodKey/allocations/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: budgetAllocationIdParamSchema,
  }),
  asyncRoute(deleteBudgetAllocation),
);

// Rebalances budget allocations proportionally or according to user rules.
// Validates target periodKey parameter and rebalancing criteria schema.
// Passes execution to rebalanceBudgetAllocations controller logic.
router.post(
  "/finance/budgets/:periodKey/rebalance",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: periodKeyParamSchema,
    body: rebalanceBudgetAllocationsBodySchema,
  }),
  asyncRoute(rebalanceBudgetAllocations),
);

// Retrieves virtual envelope balances and rollover amounts for a budget cycle.
// Validates periodKey parameter along with query parameters for envelopes.
// Invokes getBudgetEnvelopesEndpoint controller returning active envelopes.
router.get(
  "/finance/budgets/:periodKey/envelopes",
  passport.authenticate("jwt", { session: false }),
  validate({ params: periodKeyParamSchema, query: budgetEnvelopesQuerySchema }),
  asyncRoute(getBudgetEnvelopesEndpoint),
);

// Discovers potential recurring transaction patterns via heuristic analysis.
// Validates query parameters determining candidate sensitivity and window.
// Calls listRecurringCandidatesEndpoint controller to detect subscriptions.
router.get(
  "/finance/recurring/candidates",
  passport.authenticate("jwt", { session: false }),
  validate({ query: recurringCandidatesQuerySchema }),
  asyncRoute(listRecurringCandidatesEndpoint),
);

// Lists all established recurring income and expense subscription rules.
// Requires valid user authentication context under passport JWT strategy.
// Dispatches rule fetching via listRecurringRules controller.
router.get(
  "/finance/recurring",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listRecurringRules),
);

// Creates a new recurring transaction pattern rule and schedules cadence.
// Validates recurring interval, category, amount, and frequency schemas.
// Calls createRecurringRule controller to record and activate schedule.
router.post(
  "/finance/recurring",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createRecurringRuleBodySchema }),
  asyncRoute(createRecurringRule),
);

// Modifies cadence, expected amount, or properties of an existing recurring rule.
// Validates recurring rule ID parameter and updated rule properties schema.
// Commits rule changes through updateRecurringRule controller handler.
router.patch(
  "/finance/recurring/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: recurringRuleIdParamSchema,
    body: updateRecurringRuleBodySchema,
  }),
  asyncRoute(updateRecurringRule),
);

// Projects upcoming cash flow balances across future time horizons.
// Validates query parameters such as projection period and confidence bounds.
// Invokes getForecastEndpoint controller returning forward financial modeling.
router.get(
  "/finance/forecast",
  passport.authenticate("jwt", { session: false }),
  validate({ query: forecastQuerySchema }),
  asyncRoute(getForecastEndpoint),
);

// Lists data export requests initiated by the authenticated user.
// Validates pagination and status query filter schemas.
// Calls listExports controller returning export history summaries.
router.get(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listExportsQuerySchema }),
  asyncRoute(listExports),
);

// Triggers generation of an asynchronous data export archive.
// Validates export format, date filters, and included entities schema.
// Passes job dispatching to createExport controller logic.
router.post(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createExportBodySchema }),
  asyncRoute(createExport),
);

// Retrieves all scheduled recurring data export configurations.
// Enforces JWT user authentication context across schedule requests.
// Invokes listScheduledExports controller to retrieve active schedules.
router.get(
  "/exports/schedules",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listScheduledExports),
);

// Registers a newly configured automated recurring export task.
// Validates schedule cron cadence, recipient targets, and format schemas.
// Commits scheduled job configuration via createScheduledExport controller.
router.post(
  "/exports/schedules",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createScheduledExportBodySchema }),
  asyncRoute(createScheduledExport),
);

// Updates timing, filters, or delivery targets of a scheduled export.
// Validates schedule ID parameter and updateScheduledExportBodySchema fields.
// Calls updateScheduledExport controller to apply modifications.
router.patch(
  "/exports/schedules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema, body: updateScheduledExportBodySchema }),
  asyncRoute(updateScheduledExport),
);

// Cancels and permanently removes an active recurring export schedule.
// Validates schedule objectId route parameter and checks ownership.
// Invokes deleteScheduledExport controller to terminate task.
router.delete(
  "/exports/schedules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(deleteScheduledExport),
);

// Immediately executes an ad-hoc run of a configured export schedule.
// Validates schedule objectId route parameter before job enqueueing.
// Dispatches immediate task run via triggerScheduledExportNow controller.
router.post(
  "/exports/schedules/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(triggerScheduledExportNow),
);

// Fetches metadata and current readiness status of an export job by ID.
// Validates export objectId path parameter against database identifier.
// Calls getExportById controller returning job progress and download URI.
router.get(
  "/exports/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(getExportById),
);

// Streams the completed binary or CSV export archive file payload.
// Validates export identifier parameter and confirms file availability.
// Hands streaming response over to downloadExport controller.
router.get(
  "/exports/:id/download",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(downloadExport),
);

// Queries historical system audit log events filtered by user or action.
// Validates query parameters such as action categories and timestamps.
// Dispatches audit event search via listAuditEvents controller handler.
router.get(
  "/audit/events",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listAuditEventsQuerySchema }),
  asyncRoute(listAuditEvents),
);

// Simulates tool invocation dry-runs without persisting side-effects.
// Validates simulation parameters schema against toolsSimulateBodySchema.
// Invokes simulateTool controller returning projected execution diff.
router.post(
  "/tools/simulate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsSimulateBodySchema }),
  asyncRoute(simulateTool),
);

// Executes a client-requested system tool or integration action directly.
// Validates tool execution schema including payload args and target module.
// Executes tool logic through executeTool controller inside asyncRoute.
router.post(
  "/tools/execute",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsExecuteBodySchema }),
  asyncRoute(executeTool),
);

// Dispatches an ad-hoc natural language finance query to AI model backend.
// Validates command text, chat context, and tool permission schemas.
// Calls processAICommand controller returning structured response and artifacts.
router.post(
  "/ai/command",
  passport.authenticate("jwt", { session: false }),
  validate({ body: processCommandBodySchema }),
  asyncRoute(processAICommand),
);

// Streams real-time tokens and reasoning steps for interactive AI chat prompts.
// Validates streaming command schema and maintains persistent HTTP connection.
// Dispatches generation to processAiStream controller utilizing SSE formatting.
router.post(
  "/ai/stream",
  passport.authenticate("jwt", { session: false }),
  validate({ body: processCommandBodySchema }),
  asyncRoute(processAiStream),
);

// Simulates hypothetical financial scenarios and models projected impacts.
// Validates scenario parameters including recurring adjustments and rate shifts.
// Invokes processWhatIfScenario controller to calculate multi-horizon projections.
router.post(
  "/ai/scenario",
  passport.authenticate("jwt", { session: false }),
  validate({ body: whatIfScenarioBodySchema }),
  asyncRoute(processWhatIfScenario),
);

// Checks real-time health and safety metrics for numeric AI model generation.
// Authenticates request and monitors accuracy tolerances against hallucination.
// Calls getCanaryStatusHandler controller returning safety canary metrics.
router.get(
  "/ai/canary/number-safety",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getCanaryStatusHandler),
);

// Evaluates AI canary verification rules against output numeric calculations.
// Validates invariant evaluation payload against canaryValidateBodySchema.
// Dispatches invariant checking to validateCanaryInvariantsHandler controller.
router.post(
  "/ai/canary/validate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: canaryValidateBodySchema }),
  asyncRoute(validateCanaryInvariantsHandler),
);

// Triggers active canary probes evaluating calculation precision of AI agents.
// Validates probe execution parameters schema before running probe suites.
// Executes canary test suite through runCanaryProbesHandler controller.
router.post(
  "/ai/canary/run-probes",
  passport.authenticate("jwt", { session: false }),
  validate({ body: canaryRunProbesBodySchema }),
  asyncRoute(runCanaryProbesHandler),
);

// Establishes a server-sent events connection streaming live user notifications.
// Enforces user authentication and registers long-lived HTTP event client.
// Dispatches event pipe through streamEvents controller handler.
router.get(
  "/events/stream",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(streamEvents),
);

// Retrieves system notifications and alert items for the authenticated user.
// Validates notification filter criteria such as read status and pagination.
// Invokes listNotifications controller returning structured notification list.
router.get(
  "/notifications",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listNotificationsQuerySchema }),
  asyncRoute(listNotifications),
);

// Marks an individual notification item as acknowledged or read by ID.
// Validates notification objectId route parameter and verifies recipient.
// Commits read status change via markNotificationRead controller logic.
router.post(
  "/notifications/:id/read",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(markNotificationRead),
);

// Browses catalog of available third-party plugins and service extensions.
// Validates category, search query, and pagination parameters in query schema.
// Dispatches catalog lookup to listMarketplaceCatalog controller.
router.get(
  "/marketplace/catalog",
  passport.authenticate("jwt", { session: false }),
  validate({ query: marketplaceCatalogQuerySchema }),
  asyncRoute(listMarketplaceCatalog),
);

// Installs and provisions a selected marketplace plugin for active user context.
// Validates target plugin key and permissions grant schema from request body.
// Hands installation over to installMarketplacePlugin controller handler.
router.post(
  "/marketplace/install",
  passport.authenticate("jwt", { session: false }),
  validate({ body: installMarketplacePluginBodySchema }),
  asyncRoute(installMarketplacePlugin),
);

// Lists all currently installed and active plugins for the calling user.
// Requires authenticated JWT user context to discover scoped plugins.
// Invokes listInstalledPlugins controller to aggregate active plugins.
router.get(
  "/plugins",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listInstalledPlugins),
);

// Updates version, configuration, or permissions of an installed plugin.
// Validates pluginKey parameter and updateInstalledPluginBodySchema fields.
// Calls updateInstalledPluginVersion controller to persist modifications.
router.post(
  "/plugins/:id/update",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: pluginKeyParamSchema,
    body: updateInstalledPluginBodySchema,
  }),
  asyncRoute(updateInstalledPluginVersion),
);
// Uninstalls a marketplace plugin and cleans up registered webhooks.
// Validates plugin identifier parameter against active user installations.
// Delegates plugin removal to uninstallPlugin controller handler.
router.post(
  "/plugins/:id/uninstall",
  passport.authenticate("jwt", { session: false }),
  validate({ params: pluginKeyParamSchema }),
  asyncRoute(uninstallPlugin),
);

// Lists third-party integrations and connection statuses for active user.
// Enforces user session authentication via passport JWT strategy.
// Dispatches integration discovery to listIntegrations controller.
router.get(
  "/integrations",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listIntegrations),
);

// Handles file upload and batch ingestion for CSV bank transaction statements.
// Intercepts multipart file upload and validates CSV column mapping schema.
// Hands parsed transaction rows to importTransactionsCsvEndpoint controller.
router.post(
  "/integrations/transactions_csv/import",
  passport.authenticate("jwt", { session: false }),
  csvUpload().single("file"),
  validate({ body: transactionsCsvImportBodySchema }),
  asyncRoute(importTransactionsCsvEndpoint),
);

// Checks health, credentials validity, and sync status of an integration.
// Validates integration identifier path parameter against registered connectors.
// Invokes getIntegrationHealth controller returning diagnostic metrics.
router.get(
  "/integrations/:id/health",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema }),
  asyncRoute(getIntegrationHealth),
);

// Establishes authorization handshake and links external account integration.
// Validates connection parameters including OAuth tokens or API keys.
// Hands connection initialization over to connectIntegration controller.
router.post(
  "/integrations/:id/connect",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationConnectBodySchema,
  }),
  asyncRoute(connectIntegration),
);

// Unlinks and revokes authorization tokens for an active external integration.
// Validates integration identifier and termination reason payload schema.
// Commits disconnect procedures through disconnectIntegration controller.
router.post(
  "/integrations/:id/disconnect",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationDisconnectBodySchema,
  }),
  asyncRoute(disconnectIntegration),
);

// Queries historical sync runs, error logs, and transfer counts for connector.
// Validates query parameters such as sync date intervals and page limits.
// Dispatches audit lookup via getIntegrationHistory controller.
router.get(
  "/integrations/:id/history",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    query: integrationHistoryQuerySchema,
  }),
  asyncRoute(getIntegrationHistory),
);

// Triggers an on-demand synchronization cycle for the specified integration.
// Validates synchronization options schema including incremental vs full sync.
// Executes background ingestion through syncIntegration controller.
router.post(
  "/integrations/:id/sync",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: integrationIdParamSchema,
    body: integrationSyncBodySchema,
  }),
  asyncRoute(syncIntegration),
);

// Lists feature flags and runtime experimentation configurations.
// Validates query criteria including environment and targeting flags.
// Calls listFeatureFlags controller returning active feature flag set.
router.get(
  "/feature-flags",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listFeatureFlagsQuerySchema }),
  asyncRoute(listFeatureFlags),
);

// Creates or updates a feature flag toggle state and targeting criteria.
// Validates feature flag key parameter and upsertFeatureFlagBodySchema fields.
// Commits feature flag mutations via upsertFeatureFlag controller logic.
router.put(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: featureFlagKeyParamSchema,
    body: upsertFeatureFlagBodySchema,
  }),
  asyncRoute(upsertFeatureFlag),
);

// Deletes a configured feature flag definition and purges rollout state.
// Validates flag key parameter and requires administrative permissions.
// Calls deleteFeatureFlag controller to remove flag record from store.
router.delete(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({ params: featureFlagKeyParamSchema }),
  asyncRoute(deleteFeatureFlag),
);

// Calculates high-level aggregate financial analytics across user accounts.
// Validates overview query parameters such as timeframe and base currency.
// Invokes getAnalyticsOverview controller returning metrics snapshot.
router.get(
  "/analytics/overview",
  passport.authenticate("jwt", { session: false }),
  validate({ query: analyticsOverviewQuerySchema }),
  asyncRoute(getAnalyticsOverview),
);

// Retrieves referral program profile, invite codes, and reward balances.
// Enforces user session authentication via passport JWT strategy.
// Dispatches referral lookup to getMyReferral controller handler.
router.get(
  "/referrals/me",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getMyReferral),
);

// Redeems a referral code to apply rewards or credits to user account.
// Validates referral code payload schema against redeemReferral constraints.
// Executes redemption transaction using redeemReferral controller.
router.post(
  "/referrals/redeem",
  passport.authenticate("jwt", { session: false }),
  validate({ body: redeemReferralBodySchema }),
  asyncRoute(redeemReferral),
);

// ─── Connector Health ────────────────────────────────────
// Aggregates operational health status summaries across all active integrations.
// Authenticates user and checks synchronization statuses and latency.
// Calls getConnectorHealthSummaryEndpoint controller for diagnostics.
router.get(
  "/integrations/health-summary",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getConnectorHealthSummaryEndpoint),
);

// ─── Plugin Manifest Validation ──────────────────────────
// Validates plugin manifest structure, declared scopes, and integrity hashes.
// Authenticates caller and inspects manifest schema compliance.
// Passes manifest verification to validatePluginManifest controller.
router.post(
  "/plugins/validate-manifest",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(validatePluginManifest),
);

// Exports aggregate v1 router instance as module default export.
// Mounts into main server application under the /api/v1 prefix.
// Exposes the complete v1 REST API routing interface.
export default router;
