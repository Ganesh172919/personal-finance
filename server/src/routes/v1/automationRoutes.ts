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

// Initializes an Express router dedicated to financial automations, workflows, and autopilot.
// Coordinates scheduled multi-step workflows, webhook triggers, event streams, and category rules.
// Mounts under the v1 automation namespace to drive automated ledger and account actions.
const router = Router();

// ─── Workflows ───────────────────────────────────────────
// Lists preconfigured workflow blueprint templates available to organizations.
// Enforces JWT authentication to ensure secure discovery of system automation recipes.
// Invokes listOrgWorkflowTemplates to return catalog definitions with asyncRoute wrapping.
router.get(
  "/workflows/templates",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listOrgWorkflowTemplates),
);
// Retrieves all custom and recurring workflows configured within the caller's organization.
// Requires active JWT authentication and tenant membership authorization.
// Dispatches retrieval to listOrgWorkflows to populate workflow management dashboards.
router.get(
  "/workflows",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listOrgWorkflows),
);
// Creates and registers a new multi-step automation workflow for the organization.
// Enforces JWT session validation and validates step configurations against createWorkflowBodySchema.
// Invokes createOrgWorkflow to persist triggers, actions, and recurrence schedules.
router.post(
  "/workflows",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createWorkflowBodySchema }),
  asyncRoute(createOrgWorkflow),
);
// Ingests inbound external webhook events to trigger matching asynchronous workflows.
// Validates secret webhook URL tokens and payload bodies without requiring user session cookies.
// Dispatches event payload processing to handleWorkflowWebhook with asyncRoute protection.
router.post(
  "/workflows/webhook/:token",
  validate({ params: webhookTokenParamSchema, body: webhookPayloadBodySchema }),
  asyncRoute(handleWorkflowWebhook),
);
// Triggers an immediate on-demand execution run of a specified workflow.
// Enforces JWT authentication and validates target workflow identifiers and runtime parameters.
// Executes runOrgWorkflow to schedule step execution and emit progress telemetry.
router.post(
  "/workflows/:id/run",
  passport.authenticate("jwt", { session: false }),
  validate({ params: workflowIdParamSchema, body: runWorkflowBodySchema }),
  asyncRoute(runOrgWorkflow),
);

// ─── Autopilot ───────────────────────────────────────────
// Generates an automated financial autopilot plan based on real-time account and budget data.
// Validates plan generation preferences and targets using autopilotPlanBodySchema.
// Calls createAutopilotPlan to formulate proposed reallocations and savings actions.
router.post(
  "/autopilot/plan",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotPlanBodySchema }),
  asyncRoute(createAutopilotPlan),
);
// Simulates the financial outcome of an autopilot plan without committing changes to ledgers.
// Validates the autopilot run ID and models projected balances, cashflows, and debt payoffs.
// Delegates simulation logic to simulateAutopilotRun for user review before execution.
router.post(
  "/autopilot/simulate",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotRunIdBodySchema }),
  asyncRoute(simulateAutopilotRun),
);
// Records explicit user or admin approval for a pending autopilot financial action plan.
// Validates approval authorization tokens against autopilotApproveBodySchema.
// Dispatches to approveAutopilotRun to transition the plan to an executable state.
router.post(
  "/autopilot/approve",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotApproveBodySchema }),
  asyncRoute(approveAutopilotRun),
);
// Executes an approved financial autopilot run committing real balance and allocation adjustments.
// Validates the target run identifier and checks execution safety preconditions.
// Dispatches to executeAutopilotRun to perform automated actions and record audit events.
router.post(
  "/autopilot/execute",
  passport.authenticate("jwt", { session: false }),
  validate({ body: autopilotRunIdBodySchema }),
  asyncRoute(executeAutopilotRun),
);
// Retrieves status, telemetry, and execution logs for a specific autopilot run.
// Validates the run ObjectId parameter against objectIdSchema to prevent malformed queries.
// Invokes getAutopilotRun to return execution history and error logs if any occurred.
router.get(
  "/autopilot/runs/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(getAutopilotRun),
);

// ─── Automation Events ───────────────────────────────────
// Lists historical automation trigger events and webhook deliveries for the organization.
// Enforces JWT authentication to safeguard sensitive event telemetry from unauthorized access.
// Delegates event query execution to listAutomationEvents with standard error handling.
router.get(
  "/automation/events",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listAutomationEvents),
);
// Publishes a custom domain automation event to trigger reactive workflow subscribers.
// Validates event types and payload attributes using emitAutomationEventBodySchema.
// Dispatches event publication to emitAutomationEvent for downstream task scheduling.
router.post(
  "/automation/events/emit",
  passport.authenticate("jwt", { session: false }),
  validate({ body: emitAutomationEventBodySchema }),
  asyncRoute(emitAutomationEvent),
);

// ─── Category Rules (auto-categorization) ───────────────
// Retrieves all active transaction auto-categorization rules configured for the organization.
// Requires JWT session authentication to protect user merchant classification heuristics.
// Calls listRules to return pattern matching definitions and category associations.
router.get(
  "/category-rules",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listRules),
);
// Creates a new auto-categorization rule mapping merchant patterns to budget categories.
// Enforces JWT authentication and validates pattern expressions using createCategoryRuleBodySchema.
// Invokes createRule to persist the heuristic and apply retroactive matching where configured.
router.post(
  "/category-rules",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCategoryRuleBodySchema }),
  asyncRoute(createRule),
);
// Updates an existing auto-categorization rule's matching pattern, priority, or category mapping.
// Validates rule ObjectId parameters and partial update bodies against updateCategoryRuleBodySchema.
// Delegates rule modification to updateRule with tenant scope protection.
router.patch(
  "/category-rules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({
    params: categoryRuleIdParamSchema,
    body: updateCategoryRuleBodySchema,
  }),
  asyncRoute(updateRule),
);
// Deletes an auto-categorization rule permanently preventing future automated matching.
// Enforces JWT authentication and validates the target rule ObjectId parameter.
// Invokes deleteRule to purge the rule from the active categorization engine.
router.delete(
  "/category-rules/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: categoryRuleIdParamSchema }),
  asyncRoute(deleteRule),
);

export default router;
