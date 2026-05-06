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

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.get("/me", asyncRoute(getMyConfig));

export default router;

