/**
 * @fileoverview Notifications Hook
 *
 * Fetches and manages user notifications with polling, optimistic updates,
 * and mark-as-read functionality.
 *
 * POLLING STRATEGY:
 * Instead of relying solely on SSE for notification delivery, this hook
 * polls every 30 seconds as a fallback. This ensures notifications appear
 * even if the SSE connection drops momentarily.
 *
 * OPTIMISTIC UPDATES:
 * When marking a notification as read, the UI updates immediately (before
 * the server confirms). If the server request fails, React Query rolls
 * back to the previous state automatically via `onSettled` invalidation.
 *
 * QUERY KEY CONVENTION:
 * ["notifications", status] — allows separate caching for "all", "unread",
 * and "read" notification lists.
 *
 * @module hooks/useNotifications
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/lib/api/v1/notifications";

/** Base query key for notifications — extended with status filter */
const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * Hook to fetch and manage notifications.
 *
 * @param params.status - Filter by "unread" or "read" (default: all)
 * @param params.limit - Max notifications to fetch (default: 50)
 * @param params.enabled - Whether to enable the query (default: true)
 *
 * @returns Notifications list, unread count, and mutation functions
 */
export function useNotifications(params?: {
  status?: "unread" | "read";
  limit?: number;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();

  // Fetch notifications with polling
  const query = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, params?.status ?? "all"],
    queryFn: () =>
      listNotifications({
        status: params?.status,
        limit: params?.limit ?? 50,
      }),
    enabled: params?.enabled !== false,
    refetchInterval: 30_000, // Poll every 30s as SSE fallback
    staleTime: 10_000,       // Consider data fresh for 10s to avoid redundant refetches
  });

  // Mark single notification as read with optimistic update
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onMutate: async (notificationId) => {
      // Cancel in-flight queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      // Optimistically update the cache (UI updates immediately)
      queryClient.setQueriesData<any>(
        { queryKey: NOTIFICATIONS_KEY },
        (old: any) => {
          if (!old?.notifications) return old;
          return {
            ...old,
            notifications: old.notifications.map((n: NotificationItem) =>
              n.id === notificationId
                ? { ...n, status: "read" as const, read_at: new Date().toISOString() }
                : n
            ),
          };
        }
      );
    },
    // Always refetch after mutation settles (success or failure) to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  // Mark all notifications as read with optimistic update
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.setQueriesData<any>(
        { queryKey: NOTIFICATIONS_KEY },
        (old: any) => {
          if (!old?.notifications) return old;
          return {
            ...old,
            // Mark all as read, preserving existing read_at timestamps
            notifications: old.notifications.map((n: NotificationItem) => ({
              ...n,
              status: "read" as const,
              read_at: n.read_at || new Date().toISOString(),
            })),
          };
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  // Derived state — recomputes when query data changes
  const notifications = query.data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
    refetch: query.refetch,
  };
}
