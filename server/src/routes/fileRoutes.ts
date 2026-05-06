/**
 * @fileoverview Workspace file management routes for uploading, listing, viewing, analyzing,
 * and deleting files in the user's workspace.
 *
 * Endpoints:
 *   POST   /            - Upload up to 10 files to the workspace (multipart form data)
 *   GET    /            - List workspace files with pagination and optional search
 *   GET    /:id         - Get a single workspace file by ID
 *   POST   /:id/analyze - Trigger AI analysis of a workspace file with optional prompt
 *   DELETE /:id         - Delete a workspace file
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Multer file upload (workspaceFileUpload) on upload endpoint, max 10 files
 *   - Zod validation (common, fileSchemas) on params, query, and body
 *
 * Controllers: fileController
 */
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
