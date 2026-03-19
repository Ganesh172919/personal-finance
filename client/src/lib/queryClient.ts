import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api";

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T | null> =>
  async ({ queryKey }) => {
    const { on401: unauthorizedBehavior } = options;
    const url = queryKey.join("/");

    try {
      return await apiClient<T>(url, { method: "GET" });
    } catch (error) {
      if (unauthorizedBehavior === "returnNull" && error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  };


export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (failureCount >= 2) {
          return false;
        }

        if (error instanceof ApiError) {
          return error.status >= 500;
        }

        return true;
      },
    },
    mutations: {
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
