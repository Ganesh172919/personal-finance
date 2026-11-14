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
  createAuthoredDocument,
  queryDocumentQA,
  searchWorkspaceChunks,
  uploadWorkspaceFiles,
} from "../controllers/fileController";
import {
  downloadRenderedPdf,
  renderPdfFromPromptText,
  renderPdfFromWorkspaceTextFile,
} from "../controllers/pdfController";
import { workspaceFileUpload } from "../middleware/uploads";
import { validate } from "../middleware/validate";
import { fileIdParamSchema, objectIdSchema } from "../schemas/common";
import {
  analyzeWorkspaceFileBodySchema,
  listWorkspaceFilesQuerySchema,
  renderPdfFromTextBodySchema,
  renderWorkspaceFilePdfBodySchema,
  createAuthoredDocumentBodySchema,
  documentQABodySchema,
  searchWorkspaceChunksBodySchema,
} from "../schemas/fileSchemas";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes Express router instance for managing workspace file operations.
// Mounts routes for file uploads, semantic search, document Q&A, and PDF rendering.
// Secures all endpoints through router-level JWT authentication middleware.
const router = Router();

// Enforces passport JWT session authentication across all file endpoints.
// Verifies bearer token validity before granting access to user workspace.
// Blocks unauthenticated callers with standard 401 Unauthorized responses.
router.use(passport.authenticate("jwt", { session: false }));

// Uploads up to 10 workspace files simultaneously using multipart form data.
// Intercepts binary attachments and validates file size and mime types.
// Delegates file persistence to uploadWorkspaceFiles controller handler.
router.post("/", workspaceFileUpload().array("files", 10), asyncRoute(uploadWorkspaceFiles));

// Performs vector similarity and keyword search across chunked file documents.
// Validates query parameters against searchWorkspaceChunksBodySchema constraints.
// Invokes searchWorkspaceChunks controller returning matching file snippets.
router.post("/search", validate({ body: searchWorkspaceChunksBodySchema }), asyncRoute(searchWorkspaceChunks));

// Answers user questions grounded in uploaded workspace documents using RAG.
// Validates query prompt and document filter criteria in request payload.
// Passes question answering logic to queryDocumentQA controller handler.
router.post("/qa", validate({ body: documentQABodySchema }), asyncRoute(queryDocumentQA));

// Creates a structured authored document record directly within workspace.
// Validates document metadata, title, and body against createAuthoredDocumentBodySchema.
// Commits document creation through createAuthoredDocument controller logic.
router.post("/authored-document", validate({ body: createAuthoredDocumentBodySchema }), asyncRoute(createAuthoredDocument));

// Compiles arbitrary formatted Markdown or prompt text into a downloadable PDF.
// Validates styling options and text content against renderPdfFromTextBodySchema.
// Hands rendering pipeline to renderPdfFromPromptText controller handler.
router.post("/render-pdf", validate({ body: renderPdfFromTextBodySchema }), asyncRoute(renderPdfFromPromptText));

// Streams previously rendered PDF artifact to client browser for download.
// Validates target fileId path parameter against generated document store.
// Dispatches binary stream delivery via downloadRenderedPdf controller.
router.get("/rendered/:fileId/download", validate({ params: fileIdParamSchema }), asyncRoute(downloadRenderedPdf));

// Lists uploaded workspace documents with pagination and sorting options.
// Validates query filters such as file type, date range, and search terms.
// Calls listWorkspaceFiles controller returning catalog of workspace assets.
router.get("/", validate({ query: listWorkspaceFilesQuerySchema }), asyncRoute(listWorkspaceFiles));

// Retrieves detailed metadata and content information for a specific file.
// Validates file objectId path parameter against database identifier rules.
// Invokes getWorkspaceFile controller returning single file details.
router.get("/:id", validate({ params: objectIdSchema }), asyncRoute(getWorkspaceFile));

// Triggers asynchronous AI analysis and text extraction on a workspace file.
// Validates file objectId parameter and analyzeWorkspaceFileBodySchema options.
// Passes execution to analyzeWorkspaceFile controller wrapped in asyncRoute.
router.post(
  "/:id/analyze",
  validate({ params: objectIdSchema, body: analyzeWorkspaceFileBodySchema }),
  asyncRoute(analyzeWorkspaceFile)
);

// Converts an existing workspace text file into a styled PDF document.
// Validates file objectId path parameter and render styling specifications.
// Dispatches conversion logic to renderPdfFromWorkspaceTextFile controller.
router.post(
  "/:id/render-pdf",
  validate({ params: objectIdSchema, body: renderWorkspaceFilePdfBodySchema }),
  asyncRoute(renderPdfFromWorkspaceTextFile)
);

// Permanently removes a file and its associated vector chunks from workspace.
// Validates objectId parameter and ensures requesting user owns the resource.
// Invokes deleteWorkspaceFile controller to purge file metadata and storage.
router.delete("/:id", validate({ params: objectIdSchema }), asyncRoute(deleteWorkspaceFile));

// Exports configured file management router as default module output.
// Mounts into main application router under the /api/files route prefix.
// Provides complete REST API for document processing and PDF generation.
export default router;
