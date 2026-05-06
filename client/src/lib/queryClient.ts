/**
 * @fileoverview React Query Client Configuration
 *
 * This module configures the TanStack React Query client used throughout the
 * application for server state management. React Query handles data fetching,
 * caching, and synchronization with the server.
 *
 * KEY CONCEPTS:
 * - queryFn: Default function that fetches data for all queries
 * - staleTime: How long data is considered fresh (30 seconds)
 * - retry: Smart retry logic (only retry server errors, not client errors)
 * - UnauthorizedBehavior: Controls what happens on 401 responses
 *
 * QUERY KEY CONVENTION:
 * Query keys are joined with "/" to form the API URL.
 * Example: useQuery(["/auth/profile"]) → fetches GET /auth/profile
 *
 * @module lib/queryClient
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api";

/** Controls behavior when a query receives a 401 Unauthorized response */
type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Creates a default query function for React Query.
 *
 * This function converts query keys into API URLs and handles 401 responses
 * based on the configured behavior.
 *
 * @param options.on401 - What to do on 401: "returnNull" (for optional auth) or "throw" (for required auth)
 * @returns Query function compatible with React Query
 */
export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T | null> =>
  async ({ queryKey }) => {
    const { on401: unauthorizedBehavior } = options;
    // Join query key segments to form the API URL
    // Example: ["/api/v1", "transactions"] → "/api/v1/transactions"
    const url = queryKey.join("/");

    try {
      return await apiClient<T>(url, { method: "GET" });
    } catch (error) {
      // If on401 is "returnNull", silently return null for 401 errors
      // Useful for optional-auth queries (e.g., checking if user is logged in)
      if (unauthorizedBehavior === "returnNull" && error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error; // Re-throw all other errors
    }
  };


/**
 * Global React Query client instance.
 *
 * CONFIGURATION:
 * - staleTime: 30s — data is fresh for 30 seconds (no refetch needed)
 * - refetchInterval: false — no automatic polling
 * - refetchOnWindowFocus: false — don't refetch when window regains focus
 * - retry: Smart retry — only retry 5xx errors, max 2 retries for queries, 1 for mutations
 *
 * WHY THESE SETTINGS?
 * - No auto-refetch: The app uses SSE (Server-Sent Events) for real-time updates
 * - 30s staleTime: Reduces unnecessary refetches for data that doesn't change often
 * - Smart retry: 4xx errors are client errors (don't retry), 5xx are server errors (retry)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }), // Default: throw on 401
      refetchInterval: false,                   // No automatic polling
      refetchOnWindowFocus: false,              // No refetch on window focus
      staleTime: 30_000,                        // Data fresh for 30 seconds
      retry: (failureCount, error) => {
        // Max 2 retries for queries
        if (failureCount >= 2) {
          return false;
        }

        // Only retry server errors (5xx), not client errors (4xx)
        if (error instanceof ApiError) {
          return error.status >= 500;
        }

        return true; // Retry network errors
      },
    },
    mutations: {
      // Mutations retry more conservatively (max 1 retry)
      retry: (failureCount, error) => {
        if (failureCount >= 1) {
          return false;
        }

        if (error instanceof ApiError) {
          return error.status >= 500;
        }

        return true;
      },
    },
  },
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Query Key = URL**: The convention of using query keys as URL segments
 *    makes the API layer transparent. Components just specify the key.
 *
 * 2. **Smart Retry**: Only retrying 5xx errors prevents wasting requests on
 *    4xx errors that won't resolve on their own.
 *
 * 3. **No Auto-Refetch**: This app uses SSE for real-time updates instead
 *    of polling, which is more efficient and provides instant updates.
 *
 * 4. **StaleTime**: 30 seconds is a good default — it reduces unnecessary
 *    refetches while keeping data reasonably fresh.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * queryClient.ts → provided to the app via QueryClientProvider in AppProviders
 * queryClient.ts → used by useQuery/useMutation hooks throughout the app
 * queryClient.ts → apiClient handles the actual HTTP requests
 * ══════════════════════════════════════════════════════════════════════
 */
