import { Router } from "express";
import passport from "passport";

import { validate } from "../middleware/validate";
import { getMyEntitlements, getPlans, ingestUsageEvent } from "../controllers/monetizationController";
import { usageEventBodySchema } from "../schemas/monetizationSchemas";

const router = Router();

router.get("/plans", passport.authenticate("jwt", { session: false }), getPlans);
router.get("/entitlements/me", passport.authenticate("jwt", { session: false }), getMyEntitlements);
router.post("/usage-events", validate({ body: usageEventBodySchema }), ingestUsageEvent);

export default router;
