import { Request, Response } from 'express';
import { growthStoryService } from '../services/growthStoryService';
import { logger } from '../config/logger';

export class GrowthStoryController {
  async getStories(req: Request, res: Response) {
    try {
      const { page, limit, category, difficulty, tag, sort, isFeatured, search } = req.query;

      const result = await growthStoryService.getStories({
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        category: category as string,
        difficulty: difficulty as string,
        tag: tag as string,
        sort: sort as string,
        isFeatured: isFeatured ? isFeatured === 'true' : undefined,
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error in getStories: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch growth stories' });
    }
  }

  async getFeaturedStories(req: Request, res: Response) {
      try {
          const { limit } = req.query;
          const result = await growthStoryService.getStories({ 
              isFeatured: true, 
              limit: limit ? parseInt(limit as string, 10) : 2,
              sort: 'newest'
          });
          res.status(200).json({ stories: result.stories });
      } catch (error: any) {
          logger.error(`Error in getFeaturedStories: ${error.message}`);
          res.status(500).json({ error: 'Failed to fetch featured stories' });
      }
  }

  async getStoryBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const story = await growthStoryService.getStoryBySlug(slug);

      if (!story) {
        return res.status(404).json({ error: 'Story not found' });
      }

      res.status(200).json({ story });
    } catch (error: any) {
      logger.error(`Error in getStoryBySlug: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch growth story' });
    }
  }

  async getCategories(req: Request, res: Response) {
    try {
      const categories = await growthStoryService.getCategories();
      res.status(200).json({ categories });
    } catch (error: any) {
      logger.error(`Error in getCategories (Stories): ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  }

  async toggleLike(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const newLikesCount = await growthStoryService.toggleLike(id);
      res.status(200).json({ likes: newLikesCount });
    } catch (error: any) {
      logger.error(`Error in toggleLike (Story): ${error.message}`);
      if (error.message === 'Story not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to toggle like' });
      }
    }
  }
  
  async createStory(req: Request, res: Response) {
      try {
          const userId = (req as any).user?._id;
          
          if (!userId) {
              return res.status(401).json({ error: "Unauthorized. Must be logged in to create a story." });
          }

          const storyData = {
              ...req.body,
              userId,
              isPublished: true, 
              readTime: req.body.readTime || Math.ceil((req.body.journey?.split(/\s+/).length || 0) / 200) || 5
          };

          const newStory = await growthStoryService.createStory(storyData);
          res.status(201).json({ story: newStory });
      } catch (error: any) {
          logger.error(`Error in createStory: ${error.message}`);
          res.status(500).json({ error: "Failed to create growth story", details: error.message });
      }
  }
}

export const growthStoryController = new GrowthStoryController();
