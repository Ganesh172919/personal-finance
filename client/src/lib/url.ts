const MAX_NEXT_LENGTH = 2048;

export const getSearchParam = (location: string, key: string): string | null => {
  const idx = location.indexOf("?");
  if (idx < 0) return null;
  const search = location.slice(idx + 1);
  try {
    return new URLSearchParams(search).get(key);
  } catch {
    return null;
  }
};

export const sanitizeNextPath = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_NEXT_LENGTH) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  if (trimmed.includes("\\") || trimmed.includes("\n") || trimmed.includes("\r")) return null;
  return trimmed;
};

