// Re-exports low-level API client utilities, CSRF management, and error types.
// Provides consumers unified access to core HTTP transport infrastructure.
// Encapsulates CSRF lifecycle controls and network failure representations.
export { ApiError, apiClient, fetchCsrfToken, getCsrfToken, setCsrfToken } from "@/lib/apiClient";
// Re-exports domain-specific API endpoint functions and query helpers.
// Exposes modules covering authentication, AI, chat, billing, and transactions.
// Unifies client-side service facades under a streamlined namespace.
export * from "@/lib/api";
// Re-exports content management and educational article API interfaces.
// Exposes fetching utilities for user guides, system updates, and tutorials.
// Facilitates content retrieval across dashboard widgets and knowledge bases.
export * from "@/lib/api/content";
