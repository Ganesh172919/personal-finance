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
import passport from "passport";
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

// Initializes an Express router dedicated to financial education blog articles and tutorials.
// Exposes public article listing and discovery alongside authenticated authoring and interactions.
// Mounts under the blog endpoint prefix in the central application routing registry.
const router = Router();

// Public routes
// Returns a paginated collection of published blog posts filtered by tag, category, or search term.
// Validates pagination and filter parameters using blogListQuerySchema to constrain database load.
// Dispatches article query execution to blogController.getPosts.
router.get("/", validate({ query: blogListQuerySchema }), asyncRoute(blogController.getPosts));

// Retrieves editorially highlighted blog posts curated for homepage and landing page banners.
// Validates query parameters against blogFeaturedQuerySchema to limit the number of featured items.
// Invokes blogController.getFeaturedPosts with asyncRoute error wrapping.
router.get("/featured", validate({ query: blogFeaturedQuerySchema }), asyncRoute(blogController.getFeaturedPosts));

// Lists the taxonomy of content categories used to organize published financial articles.
// Provides category hierarchies to client-side blog navigation menus and filter bars.
// Delegates listing logic to blogController.getCategories.
router.get("/categories", asyncRoute(blogController.getCategories));

// Retrieves a complete blog article looked up by its unique SEO-friendly URL slug.
// Validates slug format against blogSlugParamSchema to reject malformed route parameters.
// Calls blogController.getPostBySlug to return formatted markdown and post metadata.
router.get("/:slug", validate({ params: blogSlugParamSchema }), asyncRoute(blogController.getPostBySlug));

// Protected routes
// Publishes a new financial blog post authored by an authenticated system user or admin.
// Enforces JWT session validation and verifies required article fields via createBlogPostBodySchema.
// Invokes blogController.createPost to record and index the new publication.
router.post(
  "/",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createBlogPostBodySchema }),
  asyncRoute(blogController.createPost),
);

// Registers or toggles a user like endorsement on an individual blog publication.
// Utilizes optionalJwtAuth to link reactions to registered user accounts when available.
// Validates the target post ObjectId and invokes blogController.toggleLike.
router.post(
  "/:id/like",
  optionalJwtAuth,
  validate({ params: blogIdParamSchema }),
  asyncRoute(blogController.toggleLike),
);

export default router;
