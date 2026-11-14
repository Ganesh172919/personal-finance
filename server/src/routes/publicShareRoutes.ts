/**
 * @fileoverview Public share routes for accessing shared financial stories without authentication.
 *
 * Endpoints:
 *   GET    /shares/financial-story/:token   - Retrieve a publicly shared financial story by token
 *
 * Middleware:
 *   - Zod validation (shareSchemas: shareTokenParamSchema) on route params
 *
 * Controllers: shareController
 *
 * Note: These routes are intentionally unauthenticated -- the share token itself acts as
 * the authorization mechanism, allowing users to share read-only financial snapshots via link.
 */
import { Router } from "express";

import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { shareTokenParamSchema } from "../schemas/v1/shareSchemas";
import { getPublicFinancialStoryShare } from "../controllers/v1/shareController";

// Initializes an Express router dedicated to public, unauthenticated asset share links.
// Serves token-gated financial snapshots designed for external read-only viewing.
// Mounts into the top-level Express application without requiring user session authentication.
const router = Router();

// Serves a shared read-only financial transformation story accessed via a secure token.
// Validates the alphanumeric token parameter using shareTokenParamSchema to prevent injection.
// Delegates retrieval to getPublicFinancialStoryShare while masking sensitive user information.
router.get(
  "/shares/financial-story/:token",
  validate({ params: shareTokenParamSchema }),
  asyncRoute(getPublicFinancialStoryShare)
);

export default router;

