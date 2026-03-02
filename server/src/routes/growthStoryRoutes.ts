import { Router } from "express";
import { growthStoryController } from "../controllers/growthStoryController";
import { optionalJwtAuth } from "../middleware/optionalJwtAuth";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import {
  growthStoryListQuerySchema,
  growthStoryFeaturedQuerySchema,
  growthStorySlugParamSchema,
  growthStoryIdParamSchema,
  createGrowthStoryBodySchema,
} from "../schemas/contentSchemas";

const router = Router();

// Public routes
router.get("/", validate({ query: growthStoryListQuerySchema }), asyncRoute(growthStoryController.getStories));
router.get("/featured", validate({ query: growthStoryFeaturedQuerySchema }), asyncRoute(growthStoryController.getFeaturedStories));
router.get("/categories", asyncRoute(growthStoryController.getCategories));
router.get("/:slug", validate({ params: growthStorySlugParamSchema }), asyncRoute(growthStoryController.getStoryBySlug));

// Protected routes
router.post(
  "/",
  optionalJwtAuth,
  validate({ body: createGrowthStoryBodySchema }),
  asyncRoute(growthStoryController.createStory),
);
router.post(
  "/:id/like",
  optionalJwtAuth,
  validate({ params: growthStoryIdParamSchema }),
  asyncRoute(growthStoryController.toggleLike),
);

export default router;
