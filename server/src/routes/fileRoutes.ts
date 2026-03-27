import { Router } from "express";
import passport from "passport";

import {
  analyzeWorkspaceFile,
  deleteWorkspaceFile,
  getWorkspaceFile,
  listWorkspaceFiles,
  uploadWorkspaceFiles,
} from "../controllers/fileController";
import { workspaceFileUpload } from "../middleware/uploads";
import { validate } from "../middleware/validate";
import { objectIdSchema } from "../schemas/common";
import { analyzeWorkspaceFileBodySchema, listWorkspaceFilesQuerySchema } from "../schemas/fileSchemas";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post("/", workspaceFileUpload().array("files", 10), asyncRoute(uploadWorkspaceFiles));
router.get("/", validate({ query: listWorkspaceFilesQuerySchema }), asyncRoute(listWorkspaceFiles));
router.get("/:id", validate({ params: objectIdSchema }), asyncRoute(getWorkspaceFile));
router.post(
  "/:id/analyze",
  validate({ params: objectIdSchema, body: analyzeWorkspaceFileBodySchema }),
  asyncRoute(analyzeWorkspaceFile)
);
router.delete("/:id", validate({ params: objectIdSchema }), asyncRoute(deleteWorkspaceFile));

export default router;
