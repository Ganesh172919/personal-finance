/**
 * @fileoverview Financial journal routes for handwritten journal entry management,
 * AI insights, offline stroke batch sync, and dense semantic vector search.
 *
 * Endpoints:
 *   POST   /financial-journal/recognize-handwriting  - Upload an image and OCR-recognize handwriting
 *   GET    /financial-journal/entries                - List journal entries with pagination
 *   GET    /financial-journal/entries/:id            - Get a single journal entry by ID
 *   PATCH  /financial-journal/entries/:id            - Update a journal entry's recognized text
 *   POST   /financial-journal/entries/:id/insights   - Generate AI insights for a journal entry
 *   POST   /financial-journal/entries/batch-sync    - Batch synchronize offline notes & stroke drafts
 *   GET    /financial-journal/semantic-search        - Semantic vector cosine search over journal notes
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Multer file upload (journalUpload) on handwriting recognition
 *   - Zod validation (common, journalSchemas) on params, query, and body
 *
 * Controllers: financialJournalController
 */
import { Router } from "express";
import passport from "passport";
import { validate } from "../middleware/validate";
import { objectIdSchema, paginationQuerySchema } from "../schemas/common";
import {
  patchJournalEntryBodySchema,
  semanticSearchQuerySchema,
  syncOfflineNotesBodySchema,
} from "../schemas/journalSchemas";
import {
  batchSyncOfflineStrokes,
  generateJournalInsights,
  getJournalEntryById,
  listJournalEntries,
  patchJournalEntry,
  recognizeHandwriting,
  semanticSearchJournal,
} from "../controllers/financialJournalController";
import { journalUpload } from "../middleware/uploads";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes Express router instance for financial journal entries.
// Supports handwriting recognition, offline stroke synchronization, and semantic search.
// Protects all mounted routes with passport JWT authentication middleware.
const router = Router();

// Enforces mandatory JWT authentication across all journal endpoints.
// Verifies bearer token signature and binds user identity to request.
// Denies access to unauthorized callers with 401 Unauthorized responses.
router.use(passport.authenticate("jwt", { session: false }));

// Processes image file uploads and performs OCR handwriting recognition.
// Intercepts single image multipart upload via journalUpload middleware.
// Passes recognition processing to recognizeHandwriting controller handler.
router.post(
  "/financial-journal/recognize-handwriting",
  journalUpload().single("file"),
  asyncRoute(recognizeHandwriting)
);

// Queries paginated financial journal notes recorded by authenticated user.
// Validates page limits and cursor offsets using paginationQuerySchema.
// Invokes listJournalEntries controller returning chronological journal list.
router.get("/financial-journal/entries", validate({ query: paginationQuerySchema }), asyncRoute(listJournalEntries));

// Synchronizes offline handwritten stroke drafts and note revisions in bulk.
// Validates batch payload schema including client timestamps and stroke arrays.
// Dispatches batch synchronization to batchSyncOfflineStrokes controller.
router.post(
  "/financial-journal/entries/batch-sync",
  validate({ body: syncOfflineNotesBodySchema }),
  asyncRoute(batchSyncOfflineStrokes)
);

// Executes dense vector cosine similarity search across journal entry embeddings.
// Validates natural language query parameters against semanticSearchQuerySchema.
// Invokes semanticSearchJournal controller returning ranked semantic matches.
router.get(
  "/financial-journal/semantic-search",
  validate({ query: semanticSearchQuerySchema }),
  asyncRoute(semanticSearchJournal)
);

// Retrieves a single financial journal entry including recognized text and strokes.
// Validates journal entry objectId route parameter against schema rules.
// Calls getJournalEntryById controller returning complete entry record.
router.get("/financial-journal/entries/:id", validate({ params: objectIdSchema }), asyncRoute(getJournalEntryById));

// Modifies recognized text or manual corrections of an existing journal entry.
// Validates entry ID parameter and patchJournalEntryBodySchema payload fields.
// Commits journal entry updates through patchJournalEntry controller logic.
router.patch(
  "/financial-journal/entries/:id",
  validate({ params: objectIdSchema, body: patchJournalEntryBodySchema }),
  asyncRoute(patchJournalEntry)
);

// Generates AI financial insights and action recommendations from journal text.
// Validates target journal entry objectId parameter and confirms ownership.
// Invokes generateJournalInsights controller to synthesize contextual advice.
router.post("/financial-journal/entries/:id/insights", validate({ params: objectIdSchema }), asyncRoute(generateJournalInsights));

// Exports configured financial journal router instance as module default.
// Integrates handwritten note taking and OCR pipelines into primary application.
// Exposes complete REST interface for multimodal financial journaling.
export default router;
