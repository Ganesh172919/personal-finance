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
