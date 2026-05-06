/**
 * @fileoverview Zod validation schemas for blog and growth story content endpoints.
 *
 * Exported schemas - Blog:
 *   blogListQuerySchema        - Validates blog list query (page, limit, category, tag, sort, isFeatured, search)
 *   blogFeaturedQuerySchema    - Validates featured posts query (limit: 1-50)
 *   blogSlugParamSchema        - Validates blog slug param (non-empty string)
 *   blogIdParamSchema          - Validates blog ID param (non-empty string)
 *   createBlogPostBodySchema   - Validates blog post creation (title, content, excerpt, category, tags, etc.)
 *
 * Exported schemas - Growth Stories:
 *   growthStoryListQuerySchema     - Validates growth story list query (page, limit, category, difficulty, etc.)
 *   growthStoryFeaturedQuerySchema - Validates featured stories query (limit: 1-50)
 *   growthStorySlugParamSchema     - Validates growth story slug param
 *   growthStoryIdParamSchema       - Validates growth story ID param
 *   createGrowthStoryBodySchema    - Validates growth story creation (title, journey, category, difficulty, etc.)
 *
 * Used by: blogRoutes, growthStoryRoutes
 *
 * Key validation rules:
 *   - Sort options: newest | oldest | popular
 *   - isFeatured: string "true"/"false" transformed to boolean
 *   - Tags: array of non-empty strings
 *   - Cover images: validated as URLs when provided
 *   - Content/journey: required non-empty strings
 */
import { z } from "zod";

// ─── Blog Schemas ────────────────────────────────────────

export const blogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "oldest", "popular"]).optional(),
  isFeatured: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search: z.string().trim().min(1).optional(),
});

export const blogFeaturedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const blogSlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

export const blogIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const createBlogPostBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  excerpt: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  coverImage: z.string().url().optional(),
  readTime: z.number().int().min(1).optional(),
  author: z.object({
    name: z.string().trim().min(1).optional(),
    avatar: z.string().url().optional(),
    bio: z.string().trim().optional(),
  }).optional(),
});

// ─── Growth Story Schemas ────────────────────────────────

export const growthStoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().trim().min(1).optional(),
  difficulty: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "oldest", "popular"]).optional(),
  isFeatured: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search: z.string().trim().min(1).optional(),
});

export const growthStoryFeaturedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const growthStorySlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

export const growthStoryIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const createGrowthStoryBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  journey: z.string().trim().min(1),
  excerpt: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).optional(),
  difficulty: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  coverImage: z.string().url().optional(),
  readTime: z.number().int().min(1).optional(),
});
