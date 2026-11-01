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

const router = Router();

// ─── Comments ────────────────────────────────────────────
router.get(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  validate({ query: listCommentsQuerySchema }),
  asyncRoute(listComments),
);
router.post(
  "/comments",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createCommentBodySchema }),
  asyncRoute(createComment),
);
router.patch(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: commentIdParamSchema, body: updateCommentBodySchema }),
  asyncRoute(updateComment),
);
router.delete(
  "/comments/:id",
  passport.authenticate("jwt", { session: false }),
  validate({ params: commentIdParamSchema }),
  asyncRoute(deleteComment),
);

// ─── Activity Feed ───────────────────────────────────────
router.get(
  "/activity-feed",
  passport.authenticate("jwt", { session: false }),
  validate({ query: activityFeedQuerySchema }),
  asyncRoute(getActivityFeed),
);

// ─── Shares ──────────────────────────────────────────────
router.post(
  "/shares/financial-story",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createFinancialStoryShareBodySchema }),
  asyncRoute(createFinancialStoryShare),
);

// ─── Organization Invites ────────────────────────────────
router.post(
  "/org-invites/accept",
  passport.authenticate("jwt", { session: false }),
  validate({ body: acceptOrgInviteBodySchema }),
  asyncRoute(acceptInvite),
);

export default router;
