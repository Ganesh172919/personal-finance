/**
 * @fileoverview Task management routes for AI-generated financial action items.
 *
 * Endpoints:
 *   POST   /webhook/:token      - Inbound webhook for external task creation/completion (token-authenticated)
 *   GET    /webhook-token       - Get or generate the organization's task webhook token
 *   POST   /dispatch-webhook    - Dispatch selected tasks to an external webhook URL (Linear, Todoist, Jira, etc.)
 *   POST   /from-plan           - Create tasks from an AI-generated financial plan
 *   GET    /                    - List tasks filtered by status (open, completed, dismissed)
 *   GET    /:id                 - Get a single task by ID
 *   PATCH  /:id                 - Update a task's status, effects, or completion evidence
 *   POST   /:id/apply           - Apply a task's effects (e.g., create transactions, update goals)
 *
 * Middleware:
 *   - Passport JWT authentication applied to member routes
 *   - Token parameter validation applied to /webhook/:token
 *   - Zod validation (taskSchemas) on params, query, and body
 *
 * Controllers: taskController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import {
  applyTask,
  createTask,
  createTasksFromPlan,
  dispatchTasksWebhook,
  getTaskById,
  getTaskWebhookToken,
  handleInboundTaskWebhook,
  listTasks,
  updateTask,
} from "../controllers/taskController";
import {
  applyTaskBodySchema,
  createTaskBodySchema,
  dispatchTasksWebhookBodySchema,
  inboundTaskWebhookBodySchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  tasksFromPlanBodySchema,
  taskWebhookTokenParamSchema,
  updateTaskBodySchema,
} from "../schemas/taskSchemas";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes Express router instance for action item task management.
// Handles inbound webhooks, task creation, dispatch integrations, and plan execution.
// Applies token security, JWT session validation, and Zod parameter schemas.
const router = Router();

// Unauthenticated / token-authenticated endpoint for inbound webhooks (e.g., Linear, Jira, Zapier)
// Ingests external webhook events from project management tools such as Linear or Jira.
// Validates organization security token parameter and inbound event payload schema.
// Passes incoming event to handleInboundTaskWebhook controller inside asyncRoute.
router.post(
  "/webhook/:token",
  validate({ params: taskWebhookTokenParamSchema, body: inboundTaskWebhookBodySchema }),
  asyncRoute(handleInboundTaskWebhook)
);

// All subsequent routes require JWT authentication
// Enforces mandatory JWT authentication on all subsequent member task endpoints.
// Verifies active user token and populates session credentials on request object.
// Blocks unauthorized calls with standard 401 Unauthorized error responses.
router.use(passport.authenticate("jwt", { session: false }));

// Retrieves or generates the organization secret token for inbound task webhooks.
// Enforces authenticated user session and confirms organization administrator privileges.
// Dispatches token generation via getTaskWebhookToken controller handler.
router.get("/webhook-token", asyncRoute(getTaskWebhookToken));

// Dispatches selected task items to an external webhook integration URL.
// Validates payload containing target task IDs and external endpoint settings.
// Executes outbound webhook delivery using dispatchTasksWebhook controller.
router.post(
  "/dispatch-webhook",
  validate({ body: dispatchTasksWebhookBodySchema }),
  asyncRoute(dispatchTasksWebhook)
);

// Generates actionable financial tasks derived from an AI financial recommendation plan.
// Validates structured plan schema and extractable milestone task representations.
// Commits generated tasks through createTasksFromPlan controller handler.
router.post("/from-plan", validate({ body: tasksFromPlanBodySchema }), asyncRoute(createTasksFromPlan));

// Manually registers a new action task item for user financial follow-through.
// Validates title, category, priority, due date, and expected financial impact.
// Commits task creation via createTask controller inside asyncRoute wrapper.
router.post("/", validate({ body: createTaskBodySchema }), asyncRoute(createTask));

// Queries all action tasks filtered by status such as open, completed, or dismissed.
// Validates query parameters determining task statuses, priorities, and pagination.
// Calls listTasks controller returning filtered list of financial action items.
router.get("/", validate({ query: listTasksQuerySchema }), asyncRoute(listTasks));

// Retrieves comprehensive metadata, history, and status for a single action task.
// Validates task ID route parameter against taskIdParamSchema constraints.
// Invokes getTaskById controller returning complete task definition record.
router.get("/:id", validate({ params: taskIdParamSchema }), asyncRoute(getTaskById));

// Updates status, execution evidence, or linked metadata of an existing task.
// Validates target taskId parameter and updateTaskBodySchema payload fields.
// Calls updateTask controller to persist modifications to task database.
router.patch("/:id", validate({ params: taskIdParamSchema, body: updateTaskBodySchema }), asyncRoute(updateTask));

// Applies side-effect financial mutations associated with a completed task action.
// Validates taskId route parameter and confirmation parameters in applyTaskBodySchema.
// Commits changes such as goal updates or balance adjustments via applyTask controller.
router.post("/:id/apply", validate({ params: taskIdParamSchema, body: applyTaskBodySchema }), asyncRoute(applyTask));

// Exports configured task management router instance as default module export.
// Mounts into main server application under the /api/tasks route prefix.
// Provides complete REST interface for financial tasks and plan execution.
export default router;
