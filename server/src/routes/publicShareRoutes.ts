import { Router } from "express";

import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import { shareTokenParamSchema } from "../schemas/v1/shareSchemas";
import { getPublicFinancialStoryShare } from "../controllers/v1/shareController";

const router = Router();

router.get(
  "/shares/financial-story/:token",
  validate({ params: shareTokenParamSchema }),
  asyncRoute(getPublicFinancialStoryShare)
);

export default router;

