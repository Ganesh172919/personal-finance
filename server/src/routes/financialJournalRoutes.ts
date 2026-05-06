/**
 * @fileoverview Financial journal routes for handwritten journal entry management and AI insights.
 *
 * Endpoints:
 *   POST   /financial-journal/recognize-handwriting  - Upload an image and OCR-recognize handwriting
 *   GET    /financial-journal/entries                 - List journal entries with pagination
 *   GET    /financial-journal/entries/:id             - Get a single journal entry by ID
 *   PATCH  /financial-journal/entries/:id             - Update a journal entry's recognized text
 *   POST   /financial-journal/entries/:id/insights    - Generate AI insights for a journal entry
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
import { patchJournalEntryBodySchema } from "../schemas/journalSchemas";
import {
  generateJournalInsights,
  getJournalEntryById,
  listJournalEntries,
  patchJournalEntry,
  recognizeHandwriting,
} from "../controllers/financialJournalController";
import { journalUpload } from "../middleware/uploads";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post(
  "/financial-journal/recognize-handwriting",
  journalUpload().single("file"),
  asyncRoute(recognizeHandwriting)
);

router.get("/financial-journal/entries", validate({ query: paginationQuerySchema }), asyncRoute(listJournalEntries));
router.get("/financial-journal/entries/:id", validate({ params: objectIdSchema }), asyncRoute(getJournalEntryById));
router.patch(
  "/financial-journal/entries/:id",
  validate({ params: objectIdSchema, body: patchJournalEntryBodySchema }),
  asyncRoute(patchJournalEntry)
);
router.post("/financial-journal/entries/:id/insights", validate({ params: objectIdSchema }), asyncRoute(generateJournalInsights));

export default router;
