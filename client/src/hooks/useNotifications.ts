import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/lib/api/v1/notifications";

const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * Hook to fetch and manage notifications.
 * Polls every 30 seconds for new notifications.
 */
export function useNotifications(params?: {
  status?: "unread" | "read";
  limit?: number;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, params?.status ?? "all"],
    queryFn: () =>
      listNotifications({
        status: params?.status,
        limit: params?.limit ?? 50,
      }),
    enabled: params?.enabled !== false,
    refetchInterval: 30_000, // Poll every 30s
    staleTime: 10_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onMutate: async (notificationId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

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
