import { apiClient } from './core';

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

const apiGet = async <T>(url: string, params?: Record<string, any>) => {
  return apiClient<T>(buildUrl(url, params), { method: 'GET' });
};

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

export const getFeaturedBlogs = async (limit: number = 5) => {
  return await apiGet<ListBlogsResponse>('/api/blogs/featured', { limit });
};

export const getBlogBySlug = async (slug: string) => {
  return await apiGet<GetBlogResponse>(`/api/blogs/${slug}`);
};

export const getBlogCategories = async () => {
    return await apiGet<{categories: {category: string, count: number}[]}>('/api/blogs/categories');
}

export const toggleBlogLike = async (id: string) => {
  return await apiPost<{likes: number}>(`/api/blogs/${id}/like`, {});
};

export const createBlog = async (data: Partial<IBlogPost>) => {
    return await apiPost<{post: IBlogPost}>('/api/blogs', data);
}

// --- Growth Stories ---

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

export const getFeaturedGrowthStories = async (limit: number = 2) => {
  return await apiGet<{stories: IGrowthStory[]}>('/api/growth-stories/featured', { limit });
};

export const getGrowthStoryBySlug = async (slug: string) => {
  return await apiGet<GetGrowthStoryResponse>(`/api/growth-stories/${slug}`);
};

export const getGrowthStoryCategories = async () => {
    return await apiGet<{categories: {category: string, count: number}[]}>('/api/growth-stories/categories');
}

export const toggleGrowthStoryLike = async (id: string) => {
  return await apiPost<{likes: number}>(`/api/growth-stories/${id}/like`, {});
};

export const createGrowthStory = async (data: Partial<IGrowthStory>) => {
    return await apiPost<{story: IGrowthStory}>('/api/growth-stories', data);
}
