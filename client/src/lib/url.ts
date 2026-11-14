const MAX_NEXT_LENGTH = 2048;

// Extracts a specific query parameter value from an arbitrary URL or route location string.
// Isolates the question mark delimiter and parses search parameters within a try-catch block.
// Returns the string parameter value if found or null when missing or malformed.
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

// Sanitizes redirect target paths to guard against malicious open-redirect exploits.
// Restricts paths to relative leading slashes and blocks double slashes or protocol schemes.
// Strips control characters and enforces length limits before returning safe destination paths.
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

