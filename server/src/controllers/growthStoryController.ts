/**
 * @fileoverview Growth Story Controller
 *
 * Public-facing growth stories controller. Similar to blogController but
 * serves user-submitted financial growth journeys with category/difficulty filtering.
 *
 * Routes served:
 *   GET    /api/growth-stories             - getStories (paginated, filterable)
 *   GET    /api/growth-stories/featured    - getFeaturedStories
 *   GET    /api/growth-stories/:slug       - getStoryBySlug
 *   GET    /api/growth-stories/categories  - getCategories
 *   POST   /api/growth-stories/:id/like    - toggleLike
 *   POST   /api/growth-stories             - createStory (auth required)
 *
 * Key patterns:
 *   - Class-based controller (singleton instance exported)
 *   - Public read endpoints; createStory requires authentication
 *   - readTime auto-calculated from journey text word count
 *   - Delegates all data access to growthStoryService
 *
 * @module controllers/growthStoryController
 */

import type { Request, Response } from "express";
import { growthStoryService } from "../services/growthStoryService";
import { HttpError } from "../middleware/httpError";

export class GrowthStoryController {
  async getStories(req: Request, res: Response) {
    const { page, limit, category, difficulty, tag, sort, isFeatured, search } = req.query as Record<string, string | undefined>;

    const result = await growthStoryService.getStories({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      difficulty,
      tag,
      sort,
      isFeatured: isFeatured ? isFeatured === "true" : undefined,
      search,
    });

    res.json(result);
  }

  async getFeaturedStories(req: Request, res: Response) {
    const { limit } = req.query as Record<string, string | undefined>;
    const result = await growthStoryService.getStories({
      isFeatured: true,
      limit: limit ? parseInt(limit, 10) : 2,
      sort: "newest",
    });
    res.json({ stories: result.stories });
  }

  async getStoryBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const story = await growthStoryService.getStoryBySlug(String(slug));

    if (!story) {
      throw new HttpError(404, "NOT_FOUND", "Story not found");
    }

    res.json({ story, request_id: req.requestId });
  }

  async getCategories(_req: Request, res: Response) {
    const categories = await growthStoryService.getCategories();
    res.json({ categories });
  }

  async toggleLike(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const newLikesCount = await growthStoryService.toggleLike(String(id));
      res.json({ likes: newLikesCount, request_id: req.requestId });
    } catch (error: any) {
      if (error.message === "Story not found") {
        throw new HttpError(404, "NOT_FOUND", "Story not found");
      }
      throw error;
    }
  }

  async createStory(req: Request, res: Response) {
    const userId = (req as any).user?._id;

    if (!userId) {
      throw new HttpError(401, "UNAUTHORIZED", "Must be logged in to create a story");
    }

    const storyData = {
      ...req.body,
      userId,
      isPublished: true,
      readTime: req.body.readTime || Math.ceil((req.body.journey?.split(/\s+/).length || 0) / 200) || 5,
    };

    const newStory = await growthStoryService.createStory(storyData);
    res.status(201).json({ story: newStory, request_id: req.requestId });
  }
}

export const growthStoryController = new GrowthStoryController();
