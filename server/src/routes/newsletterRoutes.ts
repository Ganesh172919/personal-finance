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

// Initializes an Express router dedicated to financial newsletter subscription and delivery.
// Manages recurring digest preferences, on-demand previews, one-click opt-outs, and history.
// Mounts under the newsletter endpoint namespace in the primary server router.
const router = Router();

// Retrieves the active newsletter subscription preferences and cadence for the authenticated user.
// Enforces JWT authentication to guarantee that user notification settings are accessed securely.
// Dispatches retrieval to the getPreferences controller wrapped with asyncRoute.
router.get(
  "/preferences",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getPreferences)
);

// Updates newsletter delivery frequency, content focus categories, and subscription status.
// Enforces JWT authentication and validates preference payloads against updateNewsletterPreferencesBodySchema.
// Executes the updatePreferences controller to persist configuration changes.
router.put(
  "/preferences",
  passport.authenticate("jwt", { session: false }),
  validate({ body: updateNewsletterPreferencesBodySchema }),
  asyncRoute(updatePreferences)
);

// Generates an interactive HTML preview of the forthcoming newsletter digest without sending email.
// Compiles recent financial insights and market updates for review by the authenticated user.
// Invokes previewNewsletterHandler to return rendered markup.
router.post(
  "/preview",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(previewNewsletterHandler)
);

// Triggers an immediate outbound newsletter delivery to the authenticated user's registered email.
// Gated by JWT session authentication to prevent unauthorized email dispatch triggers.
// Executes sendNow to construct and transmit the personalized financial report.
router.post(
  "/send-now",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(sendNow)
);

// Processes public one-click newsletter unsubscribe requests via secure token parameter.
// Validates token formatting using unsubscribeTokenParamSchema without requiring prior user login.
// Invokes unsubscribe to opt the associated email address out of future marketing mailings.
router.get(
  "/unsubscribe/:token",
  validate({ params: unsubscribeTokenParamSchema }),
  asyncRoute(unsubscribe)
);

// Fetches the historical log of previously dispatched newsletter editions for the authenticated user.
// Validates pagination and date range query parameters using newsletterHistoryQuerySchema.
// Delegates listing to getHistory with standardized error handling.
router.get(
  "/history",
  passport.authenticate("jwt", { session: false }),
  validate({ query: newsletterHistoryQuerySchema }),
  asyncRoute(getHistory)
);

export default router;
