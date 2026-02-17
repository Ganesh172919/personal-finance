export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export const resolveApiUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (API_BASE_URL === "/api") {
    return normalized;
  }

  if (normalized.startsWith("/api")) {
    return `${API_BASE_URL}${normalized.slice("/api".length)}`;
  }

  return `${API_BASE_URL}${normalized}`;
};

export const buildApiUrl = (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const path = normalizedEndpoint.startsWith("/api") ? normalizedEndpoint : `/api${normalizedEndpoint}`;
  return resolveApiUrl(path);
};

