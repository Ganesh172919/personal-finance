/**
 * @fileoverview Growth story routes for listing, viewing, creating, and liking growth stories.
 *
 * Endpoints:
 *   GET    /                  - List growth stories with pagination, filtering, and sorting (public)
 *   GET    /featured          - Get featured growth stories (public)
 *   GET    /categories        - Get available growth story categories (public)
 *   GET    /:slug             - Get a single growth story by slug (public)
 *   POST   /                  - Create a new growth story (optional JWT auth)
 *   POST   /:id/like          - Toggle like on a growth story (optional JWT auth)
 *
 * Middleware:
 *   - Optional JWT authentication (optionalJwtAuth) on protected routes
 *   - Zod validation (contentSchemas) on query, params, and body
 *
 * Controllers: growthStoryController
 */
import { Router } from "express";
import passport from "passport";
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

// Initializes an Express router instance for customer financial growth stories.
// Mounts public catalog endpoints alongside authenticated creation and engagement routes.
// Exposes community transformation milestones and educational case studies to users.
const router = Router();

// Public routes
// Retrieves a paginated list of published growth stories filtered by tag or category.
// Validates query parameters against growthStoryListQuerySchema for sort and limit bounds.
// Dispatches retrieval to growthStoryController.getStories for public rendering.
router.get("/", validate({ query: growthStoryListQuerySchema }), asyncRoute(growthStoryController.getStories));

// Fetches highlighted financial growth stories chosen for prominent homepage display.
// Validates query arguments using growthStoryFeaturedQuerySchema to constrain batch size.
// Delegates execution to growthStoryController.getFeaturedStories.
router.get("/featured", validate({ query: growthStoryFeaturedQuerySchema }), asyncRoute(growthStoryController.getFeaturedStories));

// Lists all available taxonomy category tags associated with financial growth stories.
// Provides category filter lists to frontend navigation and discovery components.
// Invokes growthStoryController.getCategories wrapped with async error handling.
router.get("/categories", asyncRoute(growthStoryController.getCategories));

// Retrieves an individual growth story narrative looked up by its unique URL slug.
// Validates the slug string format using growthStorySlugParamSchema to block malformed inputs.
// Dispatches retrieval to growthStoryController.getStoryBySlug.
router.get("/:slug", validate({ params: growthStorySlugParamSchema }), asyncRoute(growthStoryController.getStoryBySlug));

// Protected routes
// Creates a new financial transformation story authored by an authenticated user.
// Enforces JWT authentication and validates the story title, text, and metrics via Zod.
// Delegates story persistence to growthStoryController.createStory.
router.post(
  "/",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createGrowthStoryBodySchema }),
  asyncRoute(growthStoryController.createStory),
);

// Toggles a like endorsement on a specific financial growth story.
// Applies optional JWT authentication to attribute the reaction to signed-in users when available.
// Validates the story ObjectId parameter and executes growthStoryController.toggleLike.
router.post(
  "/:id/like",
  optionalJwtAuth,
  validate({ params: growthStoryIdParamSchema }),
  asyncRoute(growthStoryController.toggleLike),
);

export default router;
