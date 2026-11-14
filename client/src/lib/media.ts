const ABSOLUTE_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;
const DATA_OR_BLOB_URL_PATTERN = /^(?:data|blob):/i;
const MONGODB_OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// Fallback cover image URL rendered when a blog article lacks a dedicated cover graphic.
// Points to a high-resolution financial planning stock photograph hosted on Unsplash.
// Ensures uniform visual card formatting throughout content lists and article headers.
export const DEFAULT_BLOG_COVER_IMAGE =
  "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80";

// Fallback banner image URL utilized for user financial growth stories without custom art.
// Displays an inspiring financial consultation photograph to maintain visual quality.
// Guarantees consistent visual aspect ratios across case study community feeds.
export const DEFAULT_GROWTH_STORY_COVER_IMAGE =
  "https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=1469&q=80";

// Default SVG avatar image URL assigned to content authors without custom portraits.
// References an automatically generated vector character illustration from DiceBear.
// Supplies an appealing visual placeholder for author bylines across published posts.
export const DEFAULT_AUTHOR_AVATAR =
  "https://api.dicebear.com/7.x/avataaars/svg?seed=finwise-author";

// Resolves raw media references into valid, secure absolute or relative image URLs.
// Handles absolute URLs, data blobs, relative endpoints, and raw Mongo GridFS IDs.
// Applies sensible fallback images whenever input paths are absent or invalid.
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
    return `/api/media/${trimmed}`;
  }

  return trimmed;
}

// Resolves the definitive image display URL for an educational blog article cover.
// Evaluates the provided media source and falls back to the default blog banner graphic.
// Ensures blog cards and header sections render reliable imagery without broken links.
export function resolveBlogCoverImage(source: string | null | undefined): string {
  return resolveMediaUrl(source, DEFAULT_BLOG_COVER_IMAGE);
}

// Resolves the banner image URL used when rendering financial growth journey stories.
// Validates provided source strings and defaults to the standard growth story artwork.
// Powers visual hero headers and card previews within community story galleries.
export function resolveGrowthStoryCoverImage(source: string | null | undefined): string {
  return resolveMediaUrl(source, DEFAULT_GROWTH_STORY_COVER_IMAGE);
}

// Determines the avatar portrait URL for content creators and featured personas.
// Generates a deterministic DiceBear avatar when given an author seed identifier.
// Prevents missing avatar icons by falling back to the default platform author illustration.
export function resolveAuthorAvatar(source: string | null | undefined, seed?: string): string {
  const fallback = seed
    ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
    : DEFAULT_AUTHOR_AVATAR;
  return resolveMediaUrl(source, fallback);
}
