import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { authAny, requireScopeIfApiKey } from "../middleware/authAny";
import { objectIdSchema } from "../schemas/common";
import { createOrgBodySchema, addOrgMemberBodySchema, orgIdParamSchema, updateOrgSettingsBodySchema } from "../schemas/v1/orgSchemas";
import { createApiKeyBodySchema } from "../schemas/v1/apiKeySchemas";
import { usageLedgerQuerySchema } from "../schemas/v1/usageSchemas";
import { billingCheckoutBodySchema, billingPortalQuerySchema } from "../schemas/v1/billingSchemas";
import { createWorkflowBodySchema, runWorkflowBodySchema, workflowIdParamSchema } from "../schemas/v1/workflowSchemas";
import { createExportBodySchema, listExportsQuerySchema } from "../schemas/v1/exportSchemas";
import { acceptOrgInviteBodySchema } from "../schemas/v1/inviteSchemas";
import { listAuditEventsQuerySchema } from "../schemas/v1/auditSchemas";
import { toolsExecuteBodySchema, toolsSimulateBodySchema } from "../schemas/v1/toolSchemas";
import { listFeatureFlagsQuerySchema, featureFlagKeyParamSchema, upsertFeatureFlagBodySchema } from "../schemas/v1/featureFlagSchemas";
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
import { createOrg, listMyOrgs, addOrgMember, updateOrgSettings } from "../controllers/v1/orgController";
import { createApiKeyForOrg, listApiKeys, revokeApiKey } from "../controllers/v1/apiKeyController";
import { getUsageLedger } from "../controllers/v1/usageController";
import { createBillingPortal, createCheckoutSession, stripeWebhook } from "../controllers/v1/billingController";
import { createOrgWorkflow, listOrgWorkflows, runOrgWorkflow } from "../controllers/v1/workflowController";
import { createExport, downloadExport, getExportById, listExports } from "../controllers/v1/exportController";
import { acceptInvite } from "../controllers/v1/inviteController";
import { listAuditEvents } from "../controllers/v1/auditController";
import { executeTool, simulateTool } from "../controllers/v1/toolController";
import { deleteFeatureFlag, listFeatureFlags, upsertFeatureFlag } from "../controllers/v1/featureFlagController";
import {
  installMarketplacePlugin,
  listInstalledPlugins,
  listMarketplaceCatalog,
  uninstallPlugin,
  updateInstalledPluginVersion,
} from "../controllers/v1/marketplaceController";
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrationHealth,
  getIntegrationHistory,
  listIntegrations,
  syncIntegration,
} from "../controllers/v1/integrationController";
import { emitAutomationEvent, listAutomationEvents } from "../controllers/v1/automationEventController";
import { getAnalyticsOverview } from "../controllers/v1/analyticsController";
import { createFinancialStoryShare } from "../controllers/v1/shareController";
import { getMyReferral, redeemReferral } from "../controllers/v1/referralController";

const router = Router();

router.get("/orgs/me", passport.authenticate("jwt", { session: false }), asyncRoute(listMyOrgs));
router.post(
  "/orgs",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createOrgBodySchema }),
  asyncRoute(createOrg)
);
router.post(
  "/orgs/:orgId/members",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: addOrgMemberBodySchema }),
  asyncRoute(addOrgMember)
);
router.patch(
  "/orgs/:orgId/settings",
  passport.authenticate("jwt", { session: false }),
  validate({ params: orgIdParamSchema, body: updateOrgSettingsBodySchema }),
  asyncRoute(updateOrgSettings)
);

router.post(
  "/org-invites/accept",
  passport.authenticate("jwt", { session: false }),
  validate({ body: acceptOrgInviteBodySchema }),
  asyncRoute(acceptInvite)
);

router.get("/api-keys", passport.authenticate("jwt", { session: false }), asyncRoute(listApiKeys));
router.post(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createApiKeyBodySchema }),
  asyncRoute(createApiKeyForOrg)
);
router.post(
  "/api-keys/:id/revoke",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(revokeApiKey)
);

router.get(
  "/usage/ledger",
  authAny,
  requireScopeIfApiKey("usage:read"),
  validate({ query: usageLedgerQuerySchema }),
  asyncRoute(getUsageLedger)
);

router.post(
  "/billing/checkout",
  passport.authenticate("jwt", { session: false }),
  validate({ body: billingCheckoutBodySchema }),
  asyncRoute(createCheckoutSession)
);
router.get(
  "/billing/portal",
  passport.authenticate("jwt", { session: false }),
  validate({ query: billingPortalQuerySchema }),
  asyncRoute(createBillingPortal)
);
router.post("/billing/webhook", asyncRoute(stripeWebhook));

router.get("/workflows", passport.authenticate("jwt", { session: false }), asyncRoute(listOrgWorkflows));
router.post(
  "/workflows",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createWorkflowBodySchema }),
  asyncRoute(createOrgWorkflow)
);
router.post(
  "/workflows/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: workflowIdParamSchema, body: runWorkflowBodySchema }),
  asyncRoute(runOrgWorkflow)
);

router.get(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listExportsQuerySchema }),
  asyncRoute(listExports)
);
router.post(
  "/exports",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createExportBodySchema }),
  asyncRoute(createExport)
);
router.get(
  "/exports/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(getExportById)
);
router.get(
  "/exports/:id/download",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(downloadExport)
);

router.get(
  "/audit/events",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listAuditEventsQuerySchema }),
  asyncRoute(listAuditEvents)
);

router.post(
  "/tools/simulate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsSimulateBodySchema }),
  asyncRoute(simulateTool)
);

router.post(
  "/tools/execute",
  passport.authenticate("jwt", { session: false }),
  validate({ body: toolsExecuteBodySchema }),
  asyncRoute(executeTool)
);

router.get(
  "/marketplace/catalog",
  passport.authenticate("jwt", { session: false }),
  validate({ query: marketplaceCatalogQuerySchema }),
  asyncRoute(listMarketplaceCatalog)
);
router.post(
  "/marketplace/install",
  passport.authenticate("jwt", { session: false }),
  validate({ body: installMarketplacePluginBodySchema }),
  asyncRoute(installMarketplacePlugin)
);

router.get("/plugins", passport.authenticate("jwt", { session: false }), asyncRoute(listInstalledPlugins));
router.post(
  "/plugins/:id/update",
  passport.authenticate("jwt", { session: false }),
  validate({ params: pluginKeyParamSchema, body: updateInstalledPluginBodySchema }),
  asyncRoute(updateInstalledPluginVersion)
);
router.post(
  "/plugins/:id/uninstall",
  passport.authenticate("jwt", { session: false }),
  validate({ params: pluginKeyParamSchema }),
  asyncRoute(uninstallPlugin)
);

router.get("/integrations", passport.authenticate("jwt", { session: false }), asyncRoute(listIntegrations));
router.get(
  "/integrations/:id/health",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema }),
  asyncRoute(getIntegrationHealth)
);
router.post(
  "/integrations/:id/connect",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema, body: integrationConnectBodySchema }),
  asyncRoute(connectIntegration)
);
router.post(
  "/integrations/:id/disconnect",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema, body: integrationDisconnectBodySchema }),
  asyncRoute(disconnectIntegration)
);
router.get(
  "/integrations/:id/history",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema, query: integrationHistoryQuerySchema }),
  asyncRoute(getIntegrationHistory)
);
router.post(
  "/integrations/:id/sync",
  passport.authenticate("jwt", { session: false }),
  validate({ params: integrationIdParamSchema, body: integrationSyncBodySchema }),
  asyncRoute(syncIntegration)
);

router.get("/automation/events", passport.authenticate("jwt", { session: false }), asyncRoute(listAutomationEvents));
router.post(
  "/automation/events/emit",
  passport.authenticate("jwt", { session: false }),
  validate({ body: emitAutomationEventBodySchema }),
  asyncRoute(emitAutomationEvent)
);

router.get(
  "/feature-flags",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listFeatureFlagsQuerySchema }),
  asyncRoute(listFeatureFlags)
);
router.put(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({ params: featureFlagKeyParamSchema, body: upsertFeatureFlagBodySchema }),
  asyncRoute(upsertFeatureFlag)
);
router.delete(
  "/feature-flags/:key",
  passport.authenticate("jwt", { session: false }),
  validate({ params: featureFlagKeyParamSchema }),
  asyncRoute(deleteFeatureFlag)
);

router.get(
  "/analytics/overview",
  passport.authenticate("jwt", { session: false }),
  validate({ query: analyticsOverviewQuerySchema }),
  asyncRoute(getAnalyticsOverview)
);

router.post(
  "/shares/financial-story",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createFinancialStoryShareBodySchema }),
  asyncRoute(createFinancialStoryShare)
);

router.get("/referrals/me", passport.authenticate("jwt", { session: false }), asyncRoute(getMyReferral));
router.post(
  "/referrals/redeem",
  passport.authenticate("jwt", { session: false }),
  validate({ body: redeemReferralBodySchema }),
  asyncRoute(redeemReferral)
);

export default router;
