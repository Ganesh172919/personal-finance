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
