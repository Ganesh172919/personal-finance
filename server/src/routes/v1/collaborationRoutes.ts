/**
 * @fileoverview Collaboration routes covering comments, activity feed,
 * financial story shares, and organization invites.
 *
 * Endpoints:
 *   GET    /comments                   - List comments
 *   POST   /comments                   - Create a comment
 *   PATCH  /comments/:id              - Update a comment
 *   DELETE /comments/:id              - Delete a comment
 *   GET    /activity-feed             - Get activity feed
 *   POST   /shares/financial-story    - Share a financial story
 *   POST   /org-invites/accept        - Accept an org invite
 *
 * Middleware:
 *   - Passport JWT authentication on all endpoints
 *   - Zod validation on params, query, and body per endpoint
 *
 * Controllers: commentController, activityFeedController, shareController,
 *   inviteController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../../middleware/validate";
import { asyncRoute } from "../../utils/asyncRoute";
import { acceptOrgInviteBodySchema } from "../../schemas/v1/inviteSchemas";
import { createFinancialStoryShareBodySchema } from "../../schemas/v1/shareSchemas";
import { activityFeedQuerySchema } from "../../schemas/v1/activityFeedSchemas";
import {
  listCommentsQuerySchema,
  createCommentBodySchema,
  updateCommentBodySchema,
  commentIdParamSchema,
} from "../../schemas/v1/commentSchemas";
import { acceptInvite } from "../../controllers/v1/inviteController";
import { createFinancialStoryShare } from "../../controllers/v1/shareController";
import { getActivityFeed } from "../../controllers/v1/activityFeedController";
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from "../../controllers/v1/commentController";

// Instantiates the Express router for collaboration routes.
// Manages endpoints for comments, activity feeds, shares, and invites.
// Mounts route handlers with dedicated authentication and validation.
const router = Router();

// ─── Comments ────────────────────────────────────────────
// Retrieves paginated collaboration comments based on query filters.
// Validates query parameters and enforces JWT user authentication.
// Invokes listComments controller wrapped in asyncRoute handler.
router.get(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listCommentsQuerySchema }),
  asyncRoute(listComments),
);

// Creates a new comment under a shared financial resource or entity.
// Validates the comment payload schema and enforces JWT authentication.
// Hands execution over to createComment controller to persist record.
router.post(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCommentBodySchema }),
  asyncRoute(createComment),
);
// Updates an existing comment identified by comment ID parameter.
// Validates path parameter ID along with the update comment body payload.
// Passes control to updateComment controller for persisting modifications.
router.patch(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: commentIdParamSchema, body: updateCommentBodySchema }),
  asyncRoute(updateComment),
);
// Removes a collaboration comment by its unique ID parameter.
// Verifies caller identity and validates route parameter format.
// Calls deleteComment controller inside asyncRoute error wrapper.
router.delete(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: commentIdParamSchema }),
  asyncRoute(deleteComment),
);

// ─── Activity Feed ───────────────────────────────────────
// Fetches the activity feed events for the authenticated organization user.
// Validates query parameters such as pagination limits and cursor timestamps.
// Delegates feed generation to getActivityFeed controller logic.
router.get(
  "/activity-feed",
  passport.authenticate("jwt", { session: false }),
  validate({ query: activityFeedQuerySchema }),
  asyncRoute(getActivityFeed),
);

// ─── Shares ──────────────────────────────────────────────
// Generates a shareable financial story link with access controls.
// Validates requested permissions, recipient limits, and expiry payload.
// Dispatches story sharing operations via createFinancialStoryShare controller.
router.post(
  "/shares/financial-story",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createFinancialStoryShareBodySchema }),
  asyncRoute(createFinancialStoryShare),
);

// ─── Organization Invites ────────────────────────────────
// Processes acceptance of an organization invitation token.
// Validates invitation token body schema and verifies active auth context.
// Executes membership provisioning through acceptInvite controller.
router.post(
  "/org-invites/accept",
  passport.authenticate("jwt", { session: false }),
  validate({ body: acceptOrgInviteBodySchema }),
  asyncRoute(acceptInvite),
);

// Exports configured collaboration router instance as module default.
// Mounts into main Express application under v1 API route hierarchy.
// Provides collaborative communication and team activity capabilities.
export default router;
