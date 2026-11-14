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
// Represents the authenticated user identity who performed an organization activity.
// Captures user ID, display full name, and avatar image URL references.
// Feeds actor attribution badges across collaborative activity timelines.
export interface ActivityActor {
  id: string;
  name: string;
  avatar: string | null;
}

/** A single event in the organisation's activity feed. */
// Defines an individual audit event recorded in the organization's collaborative activity stream.
// Encapsulates event types, descriptive summaries, visual icons, and target aggregates.
// Preserves contextual payload details and timestamps for team accountability logs.
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

// Encapsulates the paginated response containing organization activity stream events.
// Delivers cursor tokens for forward and backward pagination through past audit events.
// Powers collaborative timeline feeds tracking user interventions and automation updates.
export interface ActivityFeedResponse {
  org_id: string;
  activities: ActivityItem[];
  has_more: boolean;
  next_cursor: string | null;
  request_id: string;
}

// Identifies the user who composed and published a collaborative discussion comment.
// Supplies account identifiers, display names, and user avatar profile references.
// Associates discussion commentary with verified team member identities.
export interface CommentAuthor {
  id: string;
  name: string;
  avatar: string | null;
}

/** A single comment on a resource, with optional threading and mentions. */
// Represents an individual comment attached to a designated domain entity.
// Supports hierarchical parent-child threading, user mentions, and edit histories.
// Enables contextual peer review and discussion on transactions, budgets, or goals.
export interface CommentItem {
  id: string;
  text: string;
  mentions: string[];
  parent_id: string | null;
  edited_at: string | null;
  created_at: string;
  author: CommentAuthor;
}

// Encapsulates the collection of comments associated with a specific resource.
// Scoped by organization ID, resource classification type, and entity identifier.
// Supplies threaded discussion data to contextual collaborative comment sidebars.
export interface CommentsListResponse {
  org_id: string;
  resource_type: string;
  resource_id: string;
  comments: CommentItem[];
  request_id: string;
}

// Encapsulates the result payload received following successful comment publication.
// Delivers the newly persisted comment entity complete with generation timestamps.
// Updates local comment threads immediately upon user submission confirmation.
export interface CommentCreateResponse {
  org_id: string;
  comment: CommentItem;
  request_id: string;
}

// ─── Activity Feed API ──────────────────────────────────

// Fetches the chronologically ordered organization activity feed with cursor pagination.
// Formulates URL query parameters for lookback limits, cursor markers, and event filters.
// Dispatches an authenticated GET request loading real-time collaborative event feeds.
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
  return apiClient(`/activity-feed${suffix}`);
}

// ─── Comments API ───────────────────────────────────────

// Retrieves all published discussion comments linked to an identified domain resource.
// Encodes the resource type and unique entity identifier onto the query string.
// Dispatches an authenticated GET request populating contextual collaboration panels.
/** List all comments on a specific resource. */
export async function listResourceComments(
  resourceType: string,
  resourceId: string
): Promise<CommentsListResponse> {
  return apiClient(
    `/comments?resource_type=${encodeURIComponent(resourceType)}&resource_id=${encodeURIComponent(resourceId)}`
  );
}

// Publishes a new discussion comment on a targeted resource with optional user mentions.
// Supports hierarchical threading by accepting an optional parent comment identifier.
// Dispatches an authenticated POST request creating the comment record.
/** Create a new comment on a resource, with optional mentions and threading. */
export async function createComment(params: {
  resource_type: string;
  resource_id: string;
  text: string;
  mentions?: string[];
  parent_id?: string;
}): Promise<CommentCreateResponse> {
  return apiClient("/comments", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Modifies the textual content of an existing discussion comment created by the user.
// Dispatches an authenticated PATCH request updating text and registering edit timestamps.
// Returns the updated comment entity to synchronize live collaborative thread views.
/** Edit an existing comment's text (sets `edited_at` timestamp). */
export async function updateComment(
  commentId: string,
  text: string
): Promise<{ comment: { id: string; text: string; edited_at: string } }> {
  return apiClient(`/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

// Soft-deletes a specified discussion comment while preserving thread integrity.
// Dispatches an authenticated DELETE request addressing the unique comment identifier.
// Removes the comment text from visual display while maintaining child reply hierarchies.
/** Soft-delete a comment by ID. */
export async function deleteComment(commentId: string): Promise<{ deleted: boolean }> {
  return apiClient(`/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}
