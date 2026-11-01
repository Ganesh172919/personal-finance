/**
 * @fileoverview API Base URL Resolution
 *
 * Resolves API endpoint URLs relative to the configured base URL.
 * Supports multiple deployment scenarios:
 * - Development: Vite proxy forwards /api to localhost:3000
 * - Production (same-origin): /api routes to the backend
 * - Production (cross-origin): full URL like https://api.example.com/api
 *
 * URL NORMALIZATION:
 * The `buildApiUrl` function normalizes various endpoint formats into
 * consistent /api/* paths. This allows callers to use shorthand:
 * - "/ai/process"       → "/api/ai/process"
 * - "/auth/login"       → "/api/auth/login"
 * - "/api/transactions" → "/api/transactions"
 *
 * All API routes live under /api/* — there is no /api/v1 split.
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
 * @param path - The API path (e.g., "/api/transactions")
 * @returns Fully resolved URL
 */
export const resolveApiUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  // Same-origin proxy mode — paths are already correct
  if (API_BASE_URL === "/api") {
    return normalized;
  }

  // Deduplicate: if path already starts with the base URL suffix, don't double it
  if (/^\/api(?:\/|\?|#|$)/.test(normalized) && API_BASE_URL.endsWith("/api")) {
    return `${API_BASE_URL}${normalized.slice("/api".length)}`;
  }

  return `${API_BASE_URL}${normalized}`;
};

/**
 * Builds a full API URL from a shorthand endpoint.
 * Normalizes various formats into /api/* paths.
 *
 * @param endpoint - Shorthand endpoint (e.g., "/ai/process", "/auth/login")
 * @returns Fully resolved API URL
 *
 * @example
 * buildApiUrl("/auth/login")       → "/api/auth/login"
 * buildApiUrl("/api/transactions") → "/api/transactions"
 * buildApiUrl("analytics/heatmap") → "/api/analytics/heatmap"
 */
export const buildApiUrl = (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // Already has /api prefix — pass through
  if (/^\/api(?:\/|\?|#|$)/.test(normalizedEndpoint)) {
    return resolveApiUrl(normalizedEndpoint);
  }

  // Has legacy /v1/ prefix — strip it and add /api
  // (backward compatibility during migration)
  if (normalizedEndpoint.startsWith("/v1/")) {
    return resolveApiUrl(`/api${normalizedEndpoint.slice("/v1".length)}`);
  }

  // Bare path (e.g., "/transactions") — prepend /api
  return resolveApiUrl(`/api${normalizedEndpoint}`);
};
