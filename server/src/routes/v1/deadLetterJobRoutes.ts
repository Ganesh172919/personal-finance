/**
 * @fileoverview Dead-letter job admin routes (org admin/owner).
 *   GET  /admin/dead-letter-jobs
 *   POST /admin/dead-letter-jobs/:id/replay
 */
import { Router } from "express";
import passport from "passport";

import { listDeadLetterJobsHandler, replayDeadLetterJobHandler } from "../../controllers/v1/deadLetterJobsController";
import { validate } from "../../middleware/validate";
import { objectIdSchema } from "../../schemas/common";
import { listDeadLetterJobsQuerySchema, replayDeadLetterJobBodySchema } from "../../schemas/deadLetterJobs";
import { asyncRoute } from "../../utils/asyncRoute";

// Initializes Express router instance for administrative dead-letter job routes.
// Exposes diagnostic listing and manual retry operations for failed background tasks.
// Applies JWT authentication, organizational RBAC, and Zod parameter validation.
const router = Router();

// Queries queued dead-letter jobs that failed terminal execution retries.
// Validates pagination, queue name, and error status filters in query schema.
// Invokes listDeadLetterJobsHandler controller returning failed job records.
router.get(
  "/admin/dead-letter-jobs",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listDeadLetterJobsQuerySchema }),
  asyncRoute(listDeadLetterJobsHandler)
);

// Re-enqueues a selected dead-letter job for immediate reprocessing execution.
// Validates target job objectId parameter and replay options in request body.
// Dispatches job resurrection logic through replayDeadLetterJobHandler controller.
router.post(
  "/admin/dead-letter-jobs/:id/replay",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema, body: replayDeadLetterJobBodySchema }),
  asyncRoute(replayDeadLetterJobHandler)
);

// Exports configured dead-letter job router instance as default module export.
// Mounts into administration hierarchy providing queue inspection capabilities.
// Enables operators to audit failures and recover from transient job outages.
export default router;
