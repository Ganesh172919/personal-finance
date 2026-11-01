/**
 * @fileoverview Automation routes covering workflows, autopilot, automation events,
 * and category rules (auto-categorization).
 *
 * Endpoints:
 *   GET    /workflows/templates          - List workflow templates
 *   GET    /workflows                    - List org workflows
 *   POST   /workflows                    - Create a workflow
 *   POST   /workflows/:id/run           - Run a workflow
 *   POST   /workflows/webhook/:token     - Inbound webhook trigger (token-authenticated)
 *   POST   /autopilot/plan              - Create an autopilot plan
 *   POST   /autopilot/simulate          - Simulate an autopilot run
 *   POST   /autopilot/approve           - Approve an autopilot run
 *   POST   /autopilot/execute           - Execute an autopilot run
 *   GET    /autopilot/runs/:id          - Get an autopilot run by ID
 *   GET    /automation/events           - List automation events
 *   POST   /automation/events/emit      - Emit an automation event
 *   GET    /category-rules              - List category rules
 *   POST   /category-rules              - Create a category rule
 *   PATCH  /category-rules/:id          - Update a category rule
 *   DELETE /category-rules/:id          - Delete a category rule
 *
 * Middleware:
 *   - Passport JWT authentication on org member endpoints
 *   - Webhook token authentication on /workflows/webhook/:token
 *   - Zod validation on params, query, and body per endpoint
 *
 * Controllers: workflowController, autopilotController, automationEventController,
 *   categoryRuleController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../../middleware/validate";
import { asyncRoute } from "../../utils/asyncRoute";
import { objectIdSchema } from "../../schemas/common";
import {
  createWorkflowBodySchema,
  runWorkflowBodySchema,
  webhookPayloadBodySchema,
  webhookTokenParamSchema,
  workflowIdParamSchema,
} from "../../schemas/v1/workflowSchemas";
import {
  autopilotApproveBodySchema,
  autopilotPlanBodySchema,
  autopilotRunIdBodySchema,
} from "../../schemas/v1/autopilotSchemas";
import { emitAutomationEventBodySchema } from "../../schemas/v1/automationEventSchemas";
import {
  createCategoryRuleBodySchema,
  updateCategoryRuleBodySchema,
  categoryRuleIdParamSchema,
} from "../../schemas/v1/categoryRuleSchemas";
import {
  createOrgWorkflow,
  handleWorkflowWebhook,
  listOrgWorkflows,
  listOrgWorkflowTemplates,
  runOrgWorkflow,
} from "../../controllers/v1/workflowController";
import {
  approveAutopilotRun,
  createAutopilotPlan,
  executeAutopilotRun,
  getAutopilotRun,
  simulateAutopilotRun,
} from "../../controllers/v1/autopilotController";
import {
  emitAutomationEvent,
  listAutomationEvents,
} from "../../controllers/v1/automationEventController";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} from "../../controllers/v1/categoryRuleController";

const router = Router();

// ─── Workflows ───────────────────────────────────────────
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
  "/workflows/webhook/:token",
  validate({ params: webhookTokenParamSchema, body: webhookPayloadBodySchema }),
  asyncRoute(handleWorkflowWebhook),
);
router.post(
  "/workflows/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: workflowIdParamSchema, body: runWorkflowBodySchema }),
  asyncRoute(runOrgWorkflow),
);

// ─── Autopilot ───────────────────────────────────────────
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

// ─── Automation Events ───────────────────────────────────
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

export default router;
