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

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post("/from-plan", validate({ body: tasksFromPlanBodySchema }), createTasksFromPlan);
router.get("/", validate({ query: listTasksQuerySchema }), listTasks);
router.get("/:id", validate({ params: taskIdParamSchema }), getTaskById);
router.patch("/:id", validate({ params: taskIdParamSchema, body: updateTaskBodySchema }), updateTask);
router.post("/:id/apply", validate({ params: taskIdParamSchema, body: applyTaskBodySchema }), applyTask);

export default router;
