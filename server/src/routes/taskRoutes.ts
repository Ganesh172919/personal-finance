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

const router = Router();

// Unauthenticated / token-authenticated endpoint for inbound webhooks (e.g., Linear, Jira, Zapier)
router.post(
  "/webhook/:token",
  validate({ params: taskWebhookTokenParamSchema, body: inboundTaskWebhookBodySchema }),
  asyncRoute(handleInboundTaskWebhook)
);

// All subsequent routes require JWT authentication
router.use(passport.authenticate("jwt", { session: false }));

router.get("/webhook-token", asyncRoute(getTaskWebhookToken));
router.post(
  "/dispatch-webhook",
  validate({ body: dispatchTasksWebhookBodySchema }),
  asyncRoute(dispatchTasksWebhook)
);
router.post("/from-plan", validate({ body: tasksFromPlanBodySchema }), asyncRoute(createTasksFromPlan));
router.post("/", validate({ body: createTaskBodySchema }), asyncRoute(createTask));
router.get("/", validate({ query: listTasksQuerySchema }), asyncRoute(listTasks));
router.get("/:id", validate({ params: taskIdParamSchema }), asyncRoute(getTaskById));
router.patch("/:id", validate({ params: taskIdParamSchema, body: updateTaskBodySchema }), asyncRoute(updateTask));
router.post("/:id/apply", validate({ params: taskIdParamSchema, body: applyTaskBodySchema }), asyncRoute(applyTask));

export default router;
