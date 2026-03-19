const ABSOLUTE_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;
const DATA_OR_BLOB_URL_PATTERN = /^(?:data|blob):/i;
const MONGODB_OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export const DEFAULT_BLOG_COVER_IMAGE =
  "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80";

export const DEFAULT_GROWTH_STORY_COVER_IMAGE =
  "https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=1469&q=80";

export const DEFAULT_AUTHOR_AVATAR =
  "https://api.dicebear.com/7.x/avataaars/svg?seed=finwise-author";

export function resolveMediaUrl(source: string | null | undefined, fallback?: string): string {
  const trimmed = String(source || "").trim();

  if (!trimmed) {
    return fallback || "";
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed) || DATA_OR_BLOB_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (MONGODB_OBJECT_ID_PATTERN.test(trimmed)) {
    return `/api/v1/media/${trimmed}`;
  }

  return trimmed;
}

export function resolveBlogCoverImage(source: string | null | undefined): string {
  return resolveMediaUrl(source, DEFAULT_BLOG_COVER_IMAGE);
}

export function resolveGrowthStoryCoverImage(source: string | null | undefined): string {
  return resolveMediaUrl(source, DEFAULT_GROWTH_STORY_COVER_IMAGE);
}

export function resolveAuthorAvatar(source: string | null | undefined, seed?: string): string {
  const fallback = seed
    ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
    : DEFAULT_AUTHOR_AVATAR;
  return resolveMediaUrl(source, fallback);
}
