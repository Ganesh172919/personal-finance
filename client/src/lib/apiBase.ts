export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export const resolveApiUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (API_BASE_URL === "/api") {
    return normalized;
  }

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

export const buildApiUrl = (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (normalizedEndpoint.startsWith("/api/v1")) {
    return resolveApiUrl(normalizedEndpoint);
  }

  if (normalizedEndpoint.startsWith("/v1/")) {
    return resolveApiUrl(`/api/v1${normalizedEndpoint.slice("/v1".length)}`);
  }

  if (normalizedEndpoint.startsWith("/api/")) {
    return resolveApiUrl(`/api/v1${normalizedEndpoint.slice("/api".length)}`);
  }

  if (normalizedEndpoint === "/api") {
    return resolveApiUrl("/api/v1");
  }

  const path = `/api/v1${normalizedEndpoint}`;
  return resolveApiUrl(path);
};
