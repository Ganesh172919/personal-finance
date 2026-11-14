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
import { getRequestContextRevision } from "../requestContext";

// Enumerates idempotent HTTP methods that do not alter persistent server state.
// Used to bypass CSRF token validation and permit automated read retry cycles.
// Restricts mutations like POST, PUT, and DELETE to strict security verification.
/**
 * HTTP methods that do not modify state.
 * These methods skip CSRF token injection.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** In-memory CSRF token cache (set by fetchCsrfToken or AuthContext) */
let csrfToken: string | null = null;

// Reads the authenticated user's ID string persisted within browser localStorage.
// Implements safe SSR checks to prevent window reference errors during compilation.
// Used to verify that active user context has not shifted across async operations.
const storedUserId = () => {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem("userId"); }
  catch { return null; }
};

export { ApiError };

// Updates the client's cached in-memory anti-CSRF token used for mutating requests.
// Invoked when receiving a fresh CSRF token from dedicated authentication handshakes.
// Ensures future POST, PUT, and DELETE requests transmit current validation headers.
/** Set the CSRF token (called after fetching from /auth/csrf) */
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

// Returns the currently active cached CSRF protection token string.
// Provides debugging utilities and raw network transports access to auth tokens.
// Returns null if the token has not yet been fetched from the backend server.
/** Get the current CSRF token (for debugging or external use) */
export const getCsrfToken = () => csrfToken;

// Assembles standard HTTP headers incorporating multi-tenancy and security tokens.
// Sets JSON application mime types, injects CSRF headers, and appends org IDs.
// Shared across regular JSON fetch requests and real-time streaming connections.
/** Build the same authentication context headers for JSON and raw streaming requests. */
export function buildApiRequestHeaders(method: string, options: RequestInit, activeOrgId: string | null) {
  const headers = new Headers(options.headers || {});
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }
  if (!SAFE_METHODS.has(method.toUpperCase()) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const orgHeaderInjected = Boolean(activeOrgId && !headers.has("X-Org-Id"));
  if (activeOrgId && orgHeaderInjected) {
    headers.set("X-Org-Id", activeOrgId);
  }
  return { headers, orgHeaderInjected };
}

// Fetches a fresh anti-CSRF security token from the backend authentication service.
// Updates the local in-memory token cache and returns the resolved token string.
// Invoked on initial application boot and during automatic CSRF retry recovery.
/**
 * Fetches a fresh CSRF token from the server and caches it.
 * Called on app mount and when a CSRF error occurs.
 */
export async function fetchCsrfToken(): Promise<string> {
  const response = await apiClient<{ csrf_token: string }>("/auth/csrf", { method: "GET" });
  setCsrfToken(response.csrf_token);
  return response.csrf_token;
}

// Root public HTTP client wrapper providing unified request dispatch and error parsing.
// Automatically applies cookie credentials, tenant context, and error boundaries.
// Standardizes API access across all client-side data fetching and mutation services.
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

// Executes HTTP requests with contextual tracking and automatic recovery retries.
// Intercepts 402 feature limit errors to display modal upgrade prompts to users.
// Safely retries expired CSRF tokens and cleared stale organization context headers.
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
  const contextRevision = getRequestContextRevision();
  const activeOrgId = getActiveOrgId();
  const userId = storedUserId();
  const isCurrentContext = () => contextRevision === getRequestContextRevision()
    && activeOrgId === getActiveOrgId() && userId === storedUserId();
  const method = String(options.method || "GET").toUpperCase();
  const { headers, orgHeaderInjected } = buildApiRequestHeaders(method, options, activeOrgId);

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
    // Preserve the server error, but never clear a newer workspace, open its
    // dialogs or replay a retired write using its credentials/context.
    if (!isCurrentContext()) throw apiError;

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
      if (refreshed && isCurrentContext()) {
        return apiClientInternal(endpoint, options, { ...state, retriedCsrf: true });
      }
    }

    throw apiError;
  }

  // Parse successful JSON response
  return response.json();
};
