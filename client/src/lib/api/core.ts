import { useAppDialogStore } from "@/stores/appDialogStore";

import { buildApiUrl } from "../apiBase";
import { ApiError, parseApiError } from "../apiError";
import { clearActiveOrgId, getActiveOrgId } from "../orgContext";

/**
 * Networking rules:
 * - Always route API calls through `apiClient`.
 * - Automatically inject `X-Org-Id` from active org storage.
 * - Automatically inject `X-CSRF-Token` for unsafe methods when available.
 * - Normalize API errors into `ApiError` and trigger feature-limit dialog on 402.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken: string | null = null;

export { ApiError };

export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

export const getCsrfToken = () => csrfToken;

export async function fetchCsrfToken(): Promise<string> {
  const response = await apiClient<{ csrf_token: string }>("/auth/csrf", { method: "GET" });
  setCsrfToken(response.csrf_token);
  return response.csrf_token;
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return apiClientInternal(endpoint, options, { retriedCsrf: false, retriedOrg: false });
}

const apiClientInternal = async <T>(
  endpoint: string,
  options: RequestInit,
  state: { retriedCsrf: boolean; retriedOrg: boolean }
): Promise<T> => {
  const method = String(options.method || "GET").toUpperCase();
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }

  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const activeOrgId = getActiveOrgId();
  const orgHeaderInjected = Boolean(activeOrgId && !headers.has("X-Org-Id"));
  if (activeOrgId && orgHeaderInjected) {
    headers.set("X-Org-Id", activeOrgId);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  const response = await fetch(buildApiUrl(endpoint), config);

  if (!response.ok) {
    const apiError = await parseApiError(response);

    if (
      apiError.status === 402 &&
      (apiError.code === "FEATURE_LIMIT_REACHED" || apiError.code === "FEATURE_NOT_AVAILABLE")
    ) {
      useAppDialogStore.getState().showFeatureLimit(apiError);
    }

    const shouldRetryCsrf =
      !state.retriedCsrf &&
      !SAFE_METHODS.has(method) &&
      apiError.status === 403 &&
      apiError.code === "CSRF_FAILED";

    const shouldRetryOrg =
      !state.retriedOrg &&
      SAFE_METHODS.has(method) &&
      apiError.status === 403 &&
      apiError.code === "ORG_ACCESS_DENIED" &&
      orgHeaderInjected;

    if (apiError.status === 403 && apiError.code === "ORG_ACCESS_DENIED" && orgHeaderInjected && !SAFE_METHODS.has(method)) {
      clearActiveOrgId();
    }

    if (shouldRetryOrg) {
      clearActiveOrgId();
      return apiClientInternal(endpoint, options, { ...state, retriedOrg: true });
    }

    if (shouldRetryCsrf) {
      const refreshed = await fetchCsrfToken().catch(() => null);
      if (refreshed) {
        return apiClientInternal(endpoint, options, { ...state, retriedCsrf: true });
      }
    }

    throw apiError;
  }

  return response.json();
};
