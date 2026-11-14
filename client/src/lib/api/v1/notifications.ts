/**
 * @fileoverview V1 Notifications API
 *
 * Manages in-app notifications for the active organisation. Notifications
 * are status-tracked (unread/read) and include structured metadata for
 * rendering rich notification cards in the UI.
 *
 * Key concepts:
 * - **Notification Status**: Each notification is either `"unread"` or
 *   `"read"`. The list endpoint supports filtering by status.
 * - **Mark Read**: Individual notifications can be marked as read via
 *   a POST to `/read`. There is also a convenience `markAllNotificationsRead`
 *   function that fetches all unread notifications and marks them in bulk.
 *   Note: there is no batch endpoint yet -- it iterates with `Promise.all`.
 *
 * All endpoints are scoped to the active organisation via the `apiClient`.
 */

import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

/** A single notification item with status, content, and metadata. */
// Represents an individual in-app notification delivered to the active organization.
// Tracks lifecycle read states, notification headers, body copy, and metadata payloads.
// Powers visual notification badges, alert cards, and dropdown feed components.
export interface NotificationItem {
  id: string;
  status: "unread" | "read";
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

// Encapsulates the response payload returned when querying organization notifications.
// Delivers the notification array alongside organization and server request identifiers.
// Supplies the data feed populating user notification center trays.
export interface NotificationsListResponse {
  org_id: string;
  notifications: NotificationItem[];
  request_id: string;
}

// Encapsulates the response payload returned after acknowledging a notification.
// Delivers the modified notification entity with updated read timestamps.
// Updates local notification state and decrements unread counter badges.
export interface NotificationReadResponse {
  org_id: string;
  notification: NotificationItem;
  request_id: string;
}

// ─── API Functions ────────────────────────────────────────

// Queries organization in-app notifications filtered by read status and record limits.
// Formulates query parameters for read or unread statuses and fetch limits.
// Dispatches an authenticated GET request loading notification lists.
/** List notifications with optional status filter and limit. */
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
  return apiClient(`/notifications${suffix}`);
}

// Marks a specific unread notification as acknowledged using its unique ID.
// Dispatches an authenticated POST request targeting the read confirmation route.
// Synchronizes read timestamps across devices and updates local badge counts.
/** Mark a single notification as read. */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationReadResponse> {
  return apiClient(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    },
  );
}

// Marks all active unread organization notifications as acknowledged in bulk.
// Fetches unread notification records and resolves concurrent read status requests.
// Clears notification tray unread counters and dismisses urgent alerts.
/**
 * Mark all unread notifications as read.
 * Currently implemented client-side: fetches all unread (up to 200)
 * then marks each individually. A server-side batch endpoint may be
 * added in the future.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { notifications } = await listNotifications({
    status: "unread",
    limit: 200,
  });
  await Promise.all(notifications.map((n) => markNotificationRead(n.id)));
}
