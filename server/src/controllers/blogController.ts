/**
 * @fileoverview Blog Controller
 *
 * Public-facing blog content controller. Provides endpoints for listing,
 * filtering, and interacting with blog posts. Uses a class-based pattern
 * (unlike the function-export pattern in other controllers).
 *
 * Routes served:
 *   GET    /api/blog/posts             - getPosts (paginated, filterable)
 *   GET    /api/blog/posts/featured    - getFeaturedPosts
 *   GET    /api/blog/posts/:slug       - getPostBySlug
 *   GET    /api/blog/categories        - getCategories
 *   POST   /api/blog/posts/:id/like    - toggleLike
 *   POST   /api/blog/posts             - createPost (auth required)
 *
 * Key patterns:
 *   - Class-based controller (singleton instance exported)
 *   - Public read endpoints; createPost requires authentication
 *   - readTime auto-calculated from word count (~200 words/min)
 *   - Delegates all data access to blogService
 *
 * @module controllers/blogController
 */

import type { Request, Response } from "express";
import { blogService } from "../services/blogService";
import { HttpError } from "../middleware/httpError";

// Exposes HTTP controller methods for public articles and publication interactions.
// Provides request handling, parameter extraction, and authorization delegation.
// Interacts with underlying blog service routines to deliver content payloads.
export class BlogController {
  // Retrieves a paginated list of published blog posts based on filtering criteria.
  // Parses optional search terms, categorization filters, and pagination parameters.
  // Returns formatted article listings along with pagination metadata for the client.
  async getPosts(req: Request, res: Response) {
    const { page, limit, category, tag, sort, isFeatured, search } = req.query as Record<string, string | undefined>;

    const result = await blogService.getPosts({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      tag,
      sort,
      isFeatured: isFeatured ? isFeatured === "true" : undefined,
      search,
    });

    res.json(result);
  }

  // Fetches curated and prominent articles designated for display on highlight feeds.
  // Limits query execution to a requested count of recent top-tier blog publications.
  // Responds with high-visibility post summaries to drive user engagement.
  async getFeaturedPosts(req: Request, res: Response) {
    const { limit } = req.query as Record<string, string | undefined>;
    const result = await blogService.getPosts({
      isFeatured: true,
      limit: limit ? parseInt(limit, 10) : 5,
      sort: "newest",
    });
    res.json({ posts: result.posts });
  }

  // Resolves an individual blog post using its unique human-readable slug identifier.
  // Throws a not found exception if no article matches the provided path segment.
  // Returns the complete post contents alongside tracking request identifiers.
  async getPostBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const post = await blogService.getPostBySlug(String(slug));

    if (!post) {
      throw new HttpError(404, "NOT_FOUND", "Post not found");
    }

    res.json({ post, request_id: req.requestId });
  }

  // Lists all available taxonomy classifications associated with published articles.
  // Collects distinct category values from storage to facilitate front-end filtering.
  // Dispatches the compiled set of category descriptors in the JSON response body.
  async getCategories(_req: Request, res: Response) {
    const categories = await blogService.getCategories();
    res.json({ categories });
  }

  // Toggles reader appreciation reactions for the article referenced by identifier.
  // Handles increment or decrement transitions through delegated service logic.
  // Returns the updated reaction tally accompanied by request tracking metadata.
  async toggleLike(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const newLikesCount = await blogService.toggleLike(String(id));
      res.json({ likes: newLikesCount, request_id: req.requestId });
    } catch (error: any) {
      if (error.message === "Post not found") {
        throw new HttpError(404, "NOT_FOUND", "Post not found");
      }
      throw error;
    }
  }

  // Validates author credentials and creates a new published blog article entry.
  // Automatically calculates expected reading durations based on text word counts.
  // Saves the article document to persistent storage and returns created details.
  async createPost(req: Request, res: Response) {
    const userId = (req as any).user?._id;

    if (!userId) {
      throw new HttpError(401, "UNAUTHORIZED", "Must be logged in to create a post");
    }

    const postData = {
      ...req.body,
      userId,
      author: req.body.author || {
        name: (req as any).user?.name || "Anonymous",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + userId,
        bio: "Community Contributor",
      },
      isPublished: true,
      readTime: req.body.readTime || Math.ceil((req.body.content?.split(/\s+/).length || 0) / 200) || 5,
    };

    const newPost = await blogService.createPost(postData);
    res.status(201).json({ post: newPost, request_id: req.requestId });
  }
}

// Singleton instance of the blog controller managing publication endpoints.
// Exported for registration into application route tables and middleware chains.
// Handles requests for public reading and authenticated authoring workflows.
export const blogController = new BlogController();
