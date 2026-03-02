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
