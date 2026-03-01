import { Request, Response } from 'express';
import { blogService } from '../services/blogService';
import { logger } from '../config/logger';

export class BlogController {
  async getPosts(req: Request, res: Response) {
    try {
      const { page, limit, category, tag, sort, isFeatured, search } = req.query;

      const result = await blogService.getPosts({
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        category: category as string,
        tag: tag as string,
        sort: sort as string,
        isFeatured: isFeatured ? isFeatured === 'true' : undefined,
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error in getPosts: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
  }

  async getFeaturedPosts(req: Request, res: Response) {
      try {
          const { limit } = req.query;
          const result = await blogService.getPosts({ 
              isFeatured: true, 
              limit: limit ? parseInt(limit as string, 10) : 5,
              sort: 'newest'
          });
          res.status(200).json({ posts: result.posts });
      } catch (error: any) {
          logger.error(`Error in getFeaturedPosts: ${error.message}`);
          res.status(500).json({ error: 'Failed to fetch featured posts' });
      }
  }

  async getPostBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const post = await blogService.getPostBySlug(slug);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      res.status(200).json({ post });
    } catch (error: any) {
      logger.error(`Error in getPostBySlug: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch blog post' });
    }
  }

  async getCategories(req: Request, res: Response) {
    try {
      const categories = await blogService.getCategories();
      res.status(200).json({ categories });
    } catch (error: any) {
      logger.error(`Error in getCategories: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  }

  async toggleLike(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // In a real app, verify user is authenticated and hasn't already liked
      const newLikesCount = await blogService.toggleLike(id);
      res.status(200).json({ likes: newLikesCount });
    } catch (error: any) {
      logger.error(`Error in toggleLike: ${error.message}`);
      if (error.message === 'Post not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to toggle like' });
      }
    }
  }
  
  async createPost(req: Request, res: Response) {
      try {
          // Assume user info is attached by optionalJwtAuth or similar middleware
          const userId = (req as any).user?._id;
          
          if (!userId) {
              return res.status(401).json({ error: "Unauthorized. Must be logged in to create a post." });
          }

          const postData = {
              ...req.body,
              userId,
              // Defaulting some fields for user-submitted posts
              author: req.body.author || {
                  name: (req as any).user?.name || "Anonymous",
                  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + userId,
                  bio: "Community Contributor"
              },
              isPublished: true, // You might want this false in a real app to require review
              readTime: req.body.readTime || Math.ceil((req.body.content?.split(/\s+/).length || 0) / 200) || 5
          };

          const newPost = await blogService.createPost(postData);
          res.status(201).json({ post: newPost });
      } catch (error: any) {
          logger.error(`Error in createPost: ${error.message}`);
          res.status(500).json({ error: "Failed to create blog post", details: error.message });
      }
  }
}

export const blogController = new BlogController();
