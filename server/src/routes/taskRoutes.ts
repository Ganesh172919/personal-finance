/**
 * @fileoverview Task management routes for AI-generated financial action items.
 *
 * Endpoints:
 *   POST   /from-plan   - Create tasks from an AI-generated financial plan
 *   GET    /            - List tasks filtered by status (open, completed, dismissed)
 *   GET    /:id         - Get a single task by ID
 *   PATCH  /:id         - Update a task's status, effects, or completion evidence
 *   POST   /:id/apply   - Apply a task's effects (e.g., create transactions, update goals)
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Zod validation (taskSchemas) on params, query, and body
 *
 * Controllers: taskController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import { applyTask, createTasksFromPlan, getTaskById, listTasks, updateTask } from "../controllers/taskController";
import {
  applyTaskBodySchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  tasksFromPlanBodySchema,
  updateTaskBodySchema,
} from "../schemas/taskSchemas";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post("/from-plan", validate({ body: tasksFromPlanBodySchema }), asyncRoute(createTasksFromPlan));
router.get("/", validate({ query: listTasksQuerySchema }), asyncRoute(listTasks));
router.get("/:id", validate({ params: taskIdParamSchema }), asyncRoute(getTaskById));
router.patch("/:id", validate({ params: taskIdParamSchema, body: updateTaskBodySchema }), asyncRoute(updateTask));
router.post("/:id/apply", validate({ params: taskIdParamSchema, body: applyTaskBodySchema }), asyncRoute(applyTask));

export default router;
