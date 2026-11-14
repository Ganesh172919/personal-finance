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

// Initializes Express router instance for platform monetization routes.
// Exposes subscription plan tiers, user feature entitlements, and metered usage.
// Mounts route handlers with dedicated authentication and schema validation.
const router = Router();

// Lists all available subscription tiers and feature entitlements for billing.
// Enforces passport JWT authentication on incoming plan discovery queries.
// Calls getPlans controller handler returning public and custom pricing tiers.
router.get("/plans", passport.authenticate("jwt", { session: false }), asyncRoute(getPlans));

// Retrieves current user feature entitlements and active subscription status.
// Enforces passport JWT session authentication to identify requesting account.
// Dispatches query to getMyEntitlements controller inside asyncRoute wrapper.
router.get("/entitlements/me", passport.authenticate("jwt", { session: false }), asyncRoute(getMyEntitlements));

// Ingests metered telemetry usage events reporting consumption of paid features.
// Validates event body payload against strict usageEventBodySchema constraints.
// Passes event ingestion to ingestUsageEvent controller for asynchronous processing.
router.post("/usage-events", validate({ body: usageEventBodySchema }), asyncRoute(ingestUsageEvent));

// Exports configured monetization router instance as default module export.
// Mounts into main server application under API billing and monetization prefix.
// Provides complete REST interface for subscription plans and usage tracking.
export default router;
