/**
 * @fileoverview API Base URL Resolution
 *
 * Resolves API endpoint URLs relative to the configured base URL.
 * Supports multiple deployment scenarios:
 * - Development: Vite proxy forwards /api to localhost:5000
 * - Production (same-origin): /api routes to the backend
 * - Production (cross-origin): full URL like https://api.example.com/api/v1
 *
 * URL NORMALIZATION:
 * The `buildApiUrl` function normalizes various endpoint formats into
 * consistent /api/v1/* paths. This allows callers to use shorthand:
 * - "/v1/ai/process" → "/api/v1/ai/process"
 * - "/ai/process" → "/api/v1/ai/process"
 * - "/api/transactions" → "/api/v1/transactions"
 *
 * WHY TWO FUNCTIONS?
 * - `resolveApiUrl`: Low-level — maps a path against the base URL
 * - `buildApiUrl`: High-level — normalizes endpoint shorthand and delegates
 *
 * ENVIRONMENT VARIABLE:
 * VITE_API_BASE_URL can be set to a full URL for cross-origin deployments.
 * Defaults to "/api" for same-origin (Vite proxy) development.
 *
 * @module lib/apiBase
 */

/** Base URL for all API requests. Strips trailing slash for consistency. */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

/**
 * Resolves a path against the configured API base URL.
 * Handles deduplication when the path already contains the base URL prefix.
 *
 * @param path - The API path (e.g., "/api/v1/transactions")
 * @returns Fully resolved URL
 */
export const resolveApiUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  // Same-origin proxy mode — paths are already correct
  if (API_BASE_URL === "/api") {
    return normalized;
  }

  // Deduplicate: if path already starts with the base URL suffix, don't double it
  if (normalized.startsWith("/api/v1") && API_BASE_URL.endsWith("/api/v1")) {
    return `${API_BASE_URL}${normalized.slice("/api/v1".length)}`;
  }

  if (normalized.startsWith("/api") && API_BASE_URL.endsWith("/api")) {
    return `${API_BASE_URL}${normalized.slice("/api".length)}`;
  }

  if (normalized.startsWith("/api")) {
    return `${API_BASE_URL}${normalized.slice("/api".length)}`;
  }

  return `${API_BASE_URL}${normalized}`;
};

/**
 * Builds a full API URL from a shorthand endpoint.
 * Normalizes various formats into /api/v1/* paths.
 *
 * @param endpoint - Shorthand endpoint (e.g., "/v1/ai/process", "/transactions")
 * @returns Fully resolved API URL
 */
export const buildApiUrl = (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // Already has full /api/v1 prefix — pass through
  if (normalizedEndpoint.startsWith("/api/v1")) {
    return resolveApiUrl(normalizedEndpoint);
  }

  // Has /v1/ prefix — add /api
  if (normalizedEndpoint.startsWith("/v1/")) {
    return resolveApiUrl(`/api/v1${normalizedEndpoint.slice("/v1".length)}`);
  }

  // Has /api/ prefix — add /v1
  if (normalizedEndpoint.startsWith("/api/")) {
    return resolveApiUrl(`/api/v1${normalizedEndpoint.slice("/api".length)}`);
  }

  // Bare /api — map to /api/v1
  if (normalizedEndpoint === "/api") {
    return resolveApiUrl("/api/v1");
  }

  // Bare path (e.g., "/transactions") — prepend /api/v1
  const path = `/api/v1${normalizedEndpoint}`;
  return resolveApiUrl(path);
};
