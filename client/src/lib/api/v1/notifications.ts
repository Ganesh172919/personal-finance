import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  status: "unread" | "read";
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface NotificationsListResponse {
  org_id: string;
  notifications: NotificationItem[];
  request_id: string;
}

export interface NotificationReadResponse {
  org_id: string;
  notification: NotificationItem;
  request_id: string;
}

// ─── API Functions ────────────────────────────────────────

export async function listNotifications(params?: {
  status?: "unread" | "read";
  limit?: number;
}): Promise<NotificationsListResponse> {
  const search = new URLSearchParams();
  if (params?.status) {
    search.set("status", params.status);
  }
  if (typeof params?.limit === "number") {
    search.set("limit", String(params.limit));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/notifications${suffix}`);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationReadResponse> {
  return apiClient(
    `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    },
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  // Fetch all unread, then mark each; batch endpoint can be added later.
  const { notifications } = await listNotifications({
    status: "unread",
    limit: 200,
  });
  await Promise.all(notifications.map((n) => markNotificationRead(n.id)));
}
