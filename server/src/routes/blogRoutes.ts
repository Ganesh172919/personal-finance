/**
 * @fileoverview Blog content routes for listing, viewing, creating, and liking blog posts.
 *
 * Endpoints:
 *   GET    /                  - List blog posts with pagination, filtering, and sorting (public)
 *   GET    /featured          - Get featured blog posts (public)
 *   GET    /categories        - Get available blog categories (public)
 *   GET    /:slug             - Get a single blog post by slug (public)
 *   POST   /                  - Create a new blog post (optional JWT auth)
 *   POST   /:id/like          - Toggle like on a blog post (optional JWT auth)
 *
 * Middleware:
 *   - Optional JWT authentication (optionalJwtAuth) on protected routes
 *   - Zod validation (contentSchemas) on query, params, and body
 *
 * Controllers: blogController
 */
import { Router } from "express";
import { blogController } from "../controllers/blogController";
import { optionalJwtAuth } from "../middleware/optionalJwtAuth";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import {
  blogListQuerySchema,
  blogFeaturedQuerySchema,
  blogSlugParamSchema,
  blogIdParamSchema,
  createBlogPostBodySchema,
} from "../schemas/contentSchemas";

const router = Router();

// Public routes
router.get("/", validate({ query: blogListQuerySchema }), asyncRoute(blogController.getPosts));
router.get("/featured", validate({ query: blogFeaturedQuerySchema }), asyncRoute(blogController.getFeaturedPosts));
router.get("/categories", asyncRoute(blogController.getCategories));
router.get("/:slug", validate({ params: blogSlugParamSchema }), asyncRoute(blogController.getPostBySlug));

// Protected routes
router.post(
  "/",
  optionalJwtAuth,
  validate({ body: createBlogPostBodySchema }),
  asyncRoute(blogController.createPost),
);
router.post(
  "/:id/like",
  optionalJwtAuth,
  validate({ params: blogIdParamSchema }),
  asyncRoute(blogController.toggleLike),
);

export default router;
