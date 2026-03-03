import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

export interface ActivityActor {
  id: string;
  name: string;
  avatar: string | null;
}

export interface ActivityItem {
  id: string;
  event_type: string;
  description: string;
  icon: string;
  aggregate_type: string;
  aggregate_id: string;
  actor: ActivityActor;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ActivityFeedResponse {
  org_id: string;
  activities: ActivityItem[];
  has_more: boolean;
  next_cursor: string | null;
  request_id: string;
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatar: string | null;
}

export interface CommentItem {
  id: string;
  text: string;
  mentions: string[];
  parent_id: string | null;
  edited_at: string | null;
  created_at: string;
  author: CommentAuthor;
}

export interface CommentsListResponse {
  org_id: string;
  resource_type: string;
  resource_id: string;
  comments: CommentItem[];
  request_id: string;
}

export interface CommentCreateResponse {
  org_id: string;
  comment: CommentItem;
  request_id: string;
}

// ─── Activity Feed API ──────────────────────────────────

export async function getActivityFeed(params?: {
  limit?: number;
  before?: string;
  event_type?: string;
  user_id?: string;
}): Promise<ActivityFeedResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.before) search.set("before", params.before);
  if (params?.event_type) search.set("event_type", params.event_type);
  if (params?.user_id) search.set("user_id", params.user_id);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/v1/activity-feed${suffix}`);
}

// ─── Comments API ───────────────────────────────────────

export async function listResourceComments(
  resourceType: string,
  resourceId: string
): Promise<CommentsListResponse> {
  return apiClient(
    `/v1/comments?resource_type=${encodeURIComponent(resourceType)}&resource_id=${encodeURIComponent(resourceId)}`
  );
}

export async function createComment(params: {
  resource_type: string;
  resource_id: string;
  text: string;
  mentions?: string[];
  parent_id?: string;
}): Promise<CommentCreateResponse> {
  return apiClient("/v1/comments", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function updateComment(
  commentId: string,
  text: string
): Promise<{ comment: { id: string; text: string; edited_at: string } }> {
  return apiClient(`/v1/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export async function deleteComment(commentId: string): Promise<{ deleted: boolean }> {
  return apiClient(`/v1/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}
