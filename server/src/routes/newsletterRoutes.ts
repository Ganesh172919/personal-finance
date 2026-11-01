/**
 * @fileoverview Newsletter routes for preference management, preview, send, unsubscribe, and history.
 *
 * Endpoints:
 *   GET    /preferences          - Get user's newsletter preferences
 *   PUT    /preferences          - Update newsletter preferences
 *   POST   /preview              - Generate newsletter preview (no send)
 *   POST   /send-now             - Immediately send newsletter
 *   GET    /unsubscribe/:token   - One-click unsubscribe
 *   GET    /history              - Get newsletter delivery history
 *
 * Middleware:
 *   - Passport JWT authentication on all authenticated routes
 *   - Zod validation on body, query, and params where applicable
 *
 * Controllers: newsletterController
 */
import { Router } from "express";
import passport from "passport";

import {
  getPreferences,
  updatePreferences,
  previewNewsletterHandler,
  sendNow,
  unsubscribe,
  getHistory,
} from "../controllers/newsletterController";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import {
  updateNewsletterPreferencesBodySchema,
  newsletterHistoryQuerySchema,
  unsubscribeTokenParamSchema,
} from "../schemas/newsletterSchemas";

const router = Router();

router.get(
  "/preferences",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getPreferences)
);

router.put(
  "/preferences",
  passport.authenticate("jwt", { session: false }),
  validate({ body: updateNewsletterPreferencesBodySchema }),
  asyncRoute(updatePreferences)
);

router.post(
  "/preview",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(previewNewsletterHandler)
);

router.post(
  "/send-now",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(sendNow)
);

router.get(
  "/unsubscribe/:token",
  validate({ params: unsubscribeTokenParamSchema }),
  asyncRoute(unsubscribe)
);

router.get(
  "/history",
  passport.authenticate("jwt", { session: false }),
  validate({ query: newsletterHistoryQuerySchema }),
  asyncRoute(getHistory)
);

export default router;
