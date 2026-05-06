/**
 * @fileoverview Core API Client
 *
 * The central HTTP client for all frontend API calls. Every API module
 * (transactions, auth, billing, etc.) uses `apiClient` to ensure consistent
 * behavior for authentication, org context, CSRF protection, and error handling.
 *
 * AUTOMATIC BEHAVIORS:
 * 1. Content-Type: "application/json" (unless FormData body)
 * 2. X-Org-Id: Injected from active org store (multi-tenancy)
 * 3. X-CSRF-Token: Injected for state-changing requests (POST/PUT/DELETE)
 * 4. credentials: "include" — sends HTTP-only JWT cookie
 * 5. Error normalization: All errors become ApiError instances
 * 6. Feature limit dialog: 402 errors with FEATURE_LIMIT codes trigger a modal
 *
 * RETRY LOGIC:
 * - CSRF failures (403 + CSRF_FAILED): Fetches a new CSRF token and retries once
 * - Org access denied (403 + ORG_ACCESS_DENIED): Clears stale org and retries once
 * - Each retry type is attempted at most once to prevent infinite loops
 *
 * WHY NOT AXIOS?
 * The native `fetch` API is sufficient and avoids adding a dependency.
 * The `apiClient` function provides the same conveniences (interceptors,
 * error normalization) that Axios offers.
 *
 * @module lib/api/core
 */

import { useAppDialogStore } from "@/stores/appDialogStore";

import { buildApiUrl } from "../apiBase";
import { ApiError, parseApiError } from "../apiError";
import { clearActiveOrgId, getActiveOrgId } from "../orgContext";

/**
 * HTTP methods that do not modify state.
 * These methods skip CSRF token injection.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** In-memory CSRF token cache (set by fetchCsrfToken or AuthContext) */
let csrfToken: string | null = null;

export { ApiError };

/** Set the CSRF token (called after fetching from /auth/csrf) */
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

/** Get the current CSRF token (for debugging or external use) */
export const getCsrfToken = () => csrfToken;

/**
 * Fetches a fresh CSRF token from the server and caches it.
 * Called on app mount and when a CSRF error occurs.
 */
export async function fetchCsrfToken(): Promise<string> {
  const response = await apiClient<{ csrf_token: string }>("/auth/csrf", { method: "GET" });
  setCsrfToken(response.csrf_token);
  return response.csrf_token;
}

/**
 * The main API client function. All API calls should go through this.
 *
 * @typeParam T - Expected response type
 * @param endpoint - API endpoint (e.g., "/auth/profile", "/transactions")
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns Parsed JSON response of type T
 * @throws ApiError on non-2xx responses
 */
export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return apiClientInternal(endpoint, options, { retriedCsrf: false, retriedOrg: false });
}

/**
 * Internal API client with retry state tracking.
 *
 * @param endpoint - API endpoint
 * @param options - Fetch options
 * @param state - Retry state (prevents infinite retry loops)
 */
const apiClientInternal = async <T>(
  endpoint: string,
  options: RequestInit,
  state: { retriedCsrf: boolean; retriedOrg: boolean }
): Promise<T> => {
  const method = String(options.method || "GET").toUpperCase();
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;

  // Build headers — merge caller-provided headers with automatic ones
  const headers = new Headers(options.headers || {});

  // Set Content-Type for JSON bodies (skip for FormData — browser sets multipart boundary)
  if (!headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }

  // Inject CSRF token for state-changing methods (Double Submit Cookie pattern)
  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  // Inject org context for multi-tenancy (server scopes data to this org)
  const activeOrgId = getActiveOrgId();
  const orgHeaderInjected = Boolean(activeOrgId && !headers.has("X-Org-Id"));
  if (activeOrgId && orgHeaderInjected) {
    headers.set("X-Org-Id", activeOrgId);
  }

  // Always include credentials (HTTP-only JWT cookie)
  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  const response = await fetch(buildApiUrl(endpoint), config);

  // Handle error responses
  if (!response.ok) {
    const apiError = await parseApiError(response);

    // Feature limit errors (402) → show upgrade dialog
    if (
      apiError.status === 402 &&
      (apiError.code === "FEATURE_LIMIT_REACHED" || apiError.code === "FEATURE_NOT_AVAILABLE")
    ) {
      useAppDialogStore.getState().showFeatureLimit(apiError);
    }

    // Determine if we should retry with a fresh CSRF token
    const shouldRetryCsrf =
      !state.retriedCsrf &&           // Haven't already retried
      !SAFE_METHODS.has(method) &&     // Only retry state-changing methods
      apiError.status === 403 &&       // CSRF failures return 403
      apiError.code === "CSRF_FAILED";

    // Determine if we should retry with cleared org context
    const shouldRetryOrg =
      !state.retriedOrg &&             // Haven't already retried
      SAFE_METHODS.has(method) &&      // Only retry safe methods (org clear is for reads)
      apiError.status === 403 &&       // Org access denied returns 403
      apiError.code === "ORG_ACCESS_DENIED" &&
      orgHeaderInjected;               // Only if we injected the header

    // For unsafe methods with org access denied, clear the stale org immediately
    if (apiError.status === 403 && apiError.code === "ORG_ACCESS_DENIED" && orgHeaderInjected && !SAFE_METHODS.has(method)) {
      clearActiveOrgId();
    }

    // Retry: clear stale org and re-fetch
    if (shouldRetryOrg) {
      clearActiveOrgId();
      return apiClientInternal(endpoint, options, { ...state, retriedOrg: true });
    }

    // Retry: refresh CSRF token and re-send the request
    if (shouldRetryCsrf) {
      const refreshed = await fetchCsrfToken().catch(() => null);
      if (refreshed) {
        return apiClientInternal(endpoint, options, { ...state, retriedCsrf: true });
      }
    }

    throw apiError;
  }

  // Parse successful JSON response
  return response.json();
};
