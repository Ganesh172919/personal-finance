import { apiClient } from './core';

// Constructs a parameterized query URL by appending non-undefined key-value pairs.
// Encodes search and filter parameters safely using standard URLSearchParams.
// Returns the unmodified base path when no query parameters are provided.
const buildUrl = (path: string, params?: Record<string, any>) => {
  if (!params) return path;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      urlParams.append(key, String(value));
    }
  });
  const queryString = urlParams.toString();
  return queryString ? `${path}?${queryString}` : path;
};

// Dispatches an authenticated HTTP GET request to retrieve typed JSON payloads.
// Appends query string parameters and leverages apiClient for unified error handling.
// Provides a reusable typed read wrapper for content collection endpoints.
const apiGet = async <T>(url: string, params?: Record<string, any>) => {
  return apiClient<T>(buildUrl(url, params), { method: 'GET' });
};

// Dispatches an authenticated HTTP POST request containing a JSON body payload.
// Sets standard JSON application headers and forwards serialization through apiClient.
// Facilitates creation and interactive mutation operations across content collections.
const apiPost = async <T>(url: string, data?: any) => {
  return apiClient<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
};
import type { 
    ListBlogsResponse, 
    GetBlogResponse,
    ListGrowthStoriesResponse,
    GetGrowthStoryResponse,
    IBlogPost,
    IGrowthStory 
} from '../../types/apiTypes';

// --- Blogs ---

// Fetches a paginated collection of educational blog posts matching search filters.
// Supports filtering by category, tags, featured status, sorting, and text queries.
// Powers blog feed discovery and list views across financial literacy screens.
export const getBlogs = async (params?: {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
  sort?: string;
  isFeatured?: boolean;
  search?: string;
}) => {
  return await apiGet<ListBlogsResponse>('/api/blogs', params);
};

// Retrieves a curated subset of high-priority featured educational blog articles.
// Accepts a maximum count limit and defaults to returning the top five articles.
// Populates hero banners and featured carousel components on landing views.
export const getFeaturedBlogs = async (limit: number = 5) => {
  return await apiGet<ListBlogsResponse>('/api/blogs/featured', { limit });
};

// Retrieves the complete article detail payload for a specific blog post by slug.
// Fetches rich markdown content, reading times, author profiles, and related posts.
// Feeds individual article reader screens with complete editorial metadata.
export const getBlogBySlug = async (slug: string) => {
  return await apiGet<GetBlogResponse>(`/api/blogs/${slug}`);
};

// Queries the complete distribution of blog categories along with article counts.
// Summarizes total available articles grouped by financial education topic.
// Powers topic filter tabs and navigation sidebar counts on the blog portal.
export const getBlogCategories = async () => {
    return await apiGet<{categories: {category: string, count: number}[]}>('/api/blogs/categories');
}

// Toggles the authenticated user's like reaction on a designated blog article.
// Sends an interactive like command and increments or decrements total like tallies.
// Returns the updated total like counter to refresh UI reaction buttons.
export const toggleBlogLike = async (id: string) => {
  return await apiPost<{likes: number}>(`/api/blogs/${id}/like`, {});
};

// Publishes a new educational blog article to the content repository.
// Transmits article markdown content, author details, SEO tags, and categories.
// Returns the newly persisted blog post entity upon successful creation.
export const createBlog = async (data: Partial<IBlogPost>) => {
    return await apiPost<{post: IBlogPost}>('/api/blogs', data);
}

// --- Growth Stories ---

// Queries a paginated catalog of personal finance transformation growth stories.
// Supports multi-parameter filtering across category, difficulty, tags, and terms.
// Powers community case study exploration and success story gallery feeds.
export const getGrowthStories = async (params?: {
  page?: number;
  limit?: number;
  category?: string;
  difficulty?: string;
  tag?: string;
  sort?: string;
  isFeatured?: boolean;
  search?: string;
}) => {
  return await apiGet<ListGrowthStoriesResponse>('/api/growth-stories', params);
};

// Retrieves a curated selection of featured inspirational financial growth stories.
// Defaults to fetching the top two community case studies for promotional display.
// Powers social proof cards and success story highlights on introductory pages.
export const getFeaturedGrowthStories = async (limit: number = 2) => {
  return await apiGet<{stories: IGrowthStory[]}>('/api/growth-stories/featured', { limit });
};

// Retrieves comprehensive details and journey milestones for a story by slug.
// Delivers financial trajectory metrics, implemented strategies, and key takeaways.
// Supplies the data required to render rich visual case study story views.
export const getGrowthStoryBySlug = async (slug: string) => {
  return await apiGet<GetGrowthStoryResponse>(`/api/growth-stories/${slug}`);
};

// Queries the breakdown of growth story categories along with story counts.
// Aggregates story totals by categories like debt freedom and early retirement.
// Powers category filter pills within community case study exploration views.
export const getGrowthStoryCategories = async () => {
    return await apiGet<{categories: {category: string, count: number}[]}>('/api/growth-stories/categories');
}

// Toggles an interactive like reaction on a specified financial growth story.
// Updates community appreciation counts and increments the story's reaction total.
// Returns the updated aggregate like count for optimistic client button updates.
export const toggleGrowthStoryLike = async (id: string) => {
  return await apiPost<{likes: number}>(`/api/growth-stories/${id}/like`, {});
};

// Creates and submits a new personal finance growth story narrative.
// Submits milestone timelines, difficulty levels, financial metrics, and advice.
// Persists verified user transformation journeys into the shared community library.
export const createGrowthStory = async (data: Partial<IGrowthStory>) => {
    return await apiPost<{story: IGrowthStory}>('/api/growth-stories', data);
}
