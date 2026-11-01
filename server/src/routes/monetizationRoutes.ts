/**
 * @fileoverview Monetization routes for subscription plans, user entitlements, and usage tracking.
 *
 * Endpoints:
 *   GET    /plans            - List available subscription plans (JWT required)
 *   GET    /entitlements/me  - Get current user's entitlements (JWT required)
 *   POST   /usage-events     - Ingest a usage event for metering (no auth, validated by schema)
 *
 * Middleware:
 *   - Passport JWT authentication on plans and entitlements endpoints
 *   - Zod validation (monetizationSchemas) on usage-events body
 *
 * Controllers: monetizationController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { getMyEntitlements, getPlans, ingestUsageEvent } from "../controllers/monetizationController";
import { usageEventBodySchema } from "../schemas/monetizationSchemas";

const router = Router();

router.get("/plans", passport.authenticate("jwt", { session: false }), asyncRoute(getPlans));
router.get("/entitlements/me", passport.authenticate("jwt", { session: false }), asyncRoute(getMyEntitlements));
router.post("/usage-events", validate({ body: usageEventBodySchema }), asyncRoute(ingestUsageEvent));

export default router;
