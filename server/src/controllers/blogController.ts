import type { Request, Response } from "express";
import { blogService } from "../services/blogService";
import { HttpError } from "../middleware/httpError";

export class BlogController {
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

  async getFeaturedPosts(req: Request, res: Response) {
    const { limit } = req.query as Record<string, string | undefined>;
    const result = await blogService.getPosts({
      isFeatured: true,
      limit: limit ? parseInt(limit, 10) : 5,
      sort: "newest",
    });
    res.json({ posts: result.posts });
  }

  async getPostBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const post = await blogService.getPostBySlug(String(slug));

    if (!post) {
      throw new HttpError(404, "NOT_FOUND", "Post not found");
    }

    res.json({ post, request_id: req.requestId });
  }

  async getCategories(_req: Request, res: Response) {
    const categories = await blogService.getCategories();
    res.json({ categories });
  }

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

export const blogController = new BlogController();
