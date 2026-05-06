/**
 * @fileoverview V1 Collaboration API
 *
 * Provides two collaboration primitives for organisation-scoped teamwork:
 *
 * 1. **Activity Feed**: A chronological stream of events (transaction created,
 *    goal completed, member joined, etc.) with cursor-based pagination.
 *    Events include actor info and structured payloads for rendering.
 * 2. **Comments**: Threaded comments on any resource (identified by
 *    `resource_type` + `resource_id`). Supports mentions, editing, and
 *    soft-deletion. Parent/child threading via `parent_id`.
 *
 * These features enable teams to collaborate on shared financial data
 * with full audit trails and contextual discussions.
 *
 * All endpoints are scoped to the active organisation via the `apiClient`.
 */

import { apiClient } from "../core";

// ─── Types ────────────────────────────────────────────────

/** The user who performed an activity feed action. */
export interface ActivityActor {
  id: string;
  name: string;
  avatar: string | null;
}

/** A single event in the organisation's activity feed. */
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

/** A single comment on a resource, with optional threading and mentions. */
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

/**
 * Fetch the organisation's activity feed with cursor-based pagination.
 * Use `before` (a cursor from a previous response) to load older events.
 */
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

/** List all comments on a specific resource. */
export async function listResourceComments(
  resourceType: string,
  resourceId: string
): Promise<CommentsListResponse> {
  return apiClient(
    `/v1/comments?resource_type=${encodeURIComponent(resourceType)}&resource_id=${encodeURIComponent(resourceId)}`
  );
}

/** Create a new comment on a resource, with optional mentions and threading. */
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

/** Edit an existing comment's text (sets `edited_at` timestamp). */
export async function updateComment(
  commentId: string,
  text: string
): Promise<{ comment: { id: string; text: string; edited_at: string } }> {
  return apiClient(`/v1/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

/** Soft-delete a comment by ID. */
export async function deleteComment(commentId: string): Promise<{ deleted: boolean }> {
  return apiClient(`/v1/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}
