/**
 * @fileoverview Configuration routes for retrieving client-facing app configuration.
 *
 * Endpoints:
 *   GET    /me   - Get the current user's configuration settings (JWT required)
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *
 * Controllers: configController
 */
import { Router } from "express";
import passport from "passport";

import { getMyConfig } from "../controllers/configController";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes an Express router instance dedicated to system configuration endpoints.
// Isolates configuration-related routing logic for modular mounting in the primary API router.
// Serves as the routing container for client settings and user configuration retrieval.
const router = Router();

// Enforces mandatory JWT authentication across all configuration route endpoints.
// Validates session cookies and populates request user context prior to handler execution.
// Blocks unauthenticated requests from accessing private user and system configuration state.
router.use(passport.authenticate("jwt", { session: false }));

// Handles HTTP GET requests to fetch personal configuration settings for the authenticated user.
// Wraps the getMyConfig controller with asyncRoute for standardized asynchronous error handling.
// Returns client-facing features, user preferences, and tenant configuration options.
router.get("/me", asyncRoute(getMyConfig));

export default router;

