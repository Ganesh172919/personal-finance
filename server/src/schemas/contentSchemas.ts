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

// Validates query parameters for filtering and paginating public blog articles.
// Supports categorization, tag filters, sorting orders, and keyword text search.
// Coerces string-based boolean flags into typed JavaScript boolean primitives.
export const blogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "oldest", "popular"]).optional(),
  isFeatured: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search: z.string().trim().min(1).optional(),
});

// Validates query parameters requesting spotlighted or featured blog articles.
// Coerces and limits result counts within a maximum boundary of 50 posts.
// Ensures featured article feeds remain bounded and performant.
export const blogFeaturedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Validates route parameters specifying a blog article by human-readable slug.
// Enforces a non-empty trimmed string representing the target article's URL path.
// Facilitates clean routing and SEO-friendly lookups for published blog content.
export const blogSlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

// Validates route parameters specifying a blog post by its unique record ID.
// Enforces a non-empty string identifier for administrative and internal lookups.
// Protects blog item retrieval and modification endpoints from empty params.
export const blogIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

// Validates incoming HTTP payloads creating a new public blog article post.
// Enforces mandatory titles, markdown content bodies, and optional author metadata.
// Validates cover image URLs and computes estimated reading times for display.
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

// Validates query parameters for listing and filtering community growth stories.
// Filters by topic category, implementation difficulty, tags, and featured status.
// Enforces pagination bounds and sorting criteria for educational story feeds.
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

// Validates query parameters requesting curated featured user growth stories.
// Bounds result set sizes up to a maximum limit of 50 featured story records.
// Standardizes pagination handling for homepage and showcase story carousels.
export const growthStoryFeaturedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Validates route parameters looking up a growth story by unique URL slug.
// Requires a trimmed non-empty string identifier matching published story paths.
// Ensures consistent URL resolution for publicly accessible customer case studies.
export const growthStorySlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

// Validates route parameters specifying a growth story entry by unique ID.
// Enforces a non-empty string parameter for administrative management routes.
// Prevents malformed or blank identifiers from reaching content data services.
export const growthStoryIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

// Validates incoming HTTP payloads creating a new financial growth story.
// Enforces story title, educational journey text, category, and difficulty tiers.
// Validates cover image URL syntax and bounds excerpt summaries for cards.
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
