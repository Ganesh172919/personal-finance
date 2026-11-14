/**
 * @fileoverview Chat & Agent Output API Client
 *
 * Functions for fetching AI agent outputs (analysis results) and
 * submitting user feedback on those outputs.
 *
 * AGENT OUTPUTS:
 * When the AI processes a request, it creates an "agent output" record
 * containing the analysis results, workflow trace, and metadata. These
 * are stored server-side and can be retrieved for the activity feed.
 *
 * FEEDBACK LOOP:
 * Users can rate AI outputs (thumbs up/down) with optional notes.
 * This feedback is used to improve AI model selection and prompt tuning.
 *
 * @module lib/api/chat
 */

import { apiClient } from "./core";

// Fetches the complete historical array of agent outputs generated for a specific user.
// Queries the backend by user identifier to retrieve prior advisory recommendations.
// Equips user profiles and activity views with previously computed financial analyses.
/** Fetch all agent outputs for a specific user */
export async function getAgentOutputs(userId: string): Promise<any> {
  return apiClient(`/agent-outputs/user/${userId}`);
}

// Represents an abbreviated agent output summary rendered in dashboard activity feeds.
// Captures unique identifiers, analysis types, timestamps, and linked action tasks.
// Supplies compact metadata for rendering chronological event lists efficiently.
/** Shape of a recent agent output in the activity feed */
export interface RecentAgentOutput {
  id: string;
  type: string;
  created_at: string;
  linked_task_ids: string[];
}

// Queries recent agent outputs across the workspace with validated pagination limits.
// Clamps the requested limit between 1 and 100 to guard against excessive query sizes.
// Feeds real-time activity timelines and notification widgets with fresh agent events.
/** Fetch recent agent outputs (activity feed) with input validation */
export async function getRecentAgentOutputs(limit = 20): Promise<{ outputs: RecentAgentOutput[]; request_id?: string }> {
  // Clamp limit to [1, 100] to prevent abuse
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return apiClient(`/agent-outputs/recent?limit=${safeLimit}`);
}

// Enumerates standardized taxonomy error codes for negative AI feedback submissions.
// Categorizes issues such as calculation errors, irrelevance, verbosity, and safety.
// Structures negative user feedback into quantifiable diagnostic metrics for tuning.
/**
 * Submit user feedback (thumbs up/down) on an AI agent output.
 * Used for the AI feedback loop to improve model selection.
 */
export type FeedbackReasonCode = "wrong_number" | "irrelevant" | "too_long" | "unsafe" | "unclear" | "other";

// Catalog of supported negative feedback reason codes mapped to user-facing labels.
// Drives dropdown choices and modal button options within message feedback dialogs.
// Provides users clear predefined rationale choices when rating AI responses poorly.
export const FEEDBACK_REASONS: ReadonlyArray<{ code: FeedbackReasonCode; label: string }> = [
  { code: "wrong_number", label: "Wrong number" },
  { code: "irrelevant", label: "Not relevant" },
  { code: "too_long", label: "Too long" },
  { code: "unsafe", label: "Unsafe" },
  { code: "unclear", label: "Unclear" },
  { code: "other", label: "Other" },
];

// Maximum allowed character length constraint enforced for user feedback corrections.
// Kept in exact alignment with backend validation thresholds to prevent rejection.
// Guards feedback text areas against payload truncation or server-side schema rejections.
/** Keep in sync with the server cap (AGENT_FEEDBACK_CORRECTION_MAX). */
export const FEEDBACK_CORRECTION_MAX = 500;

// Transmits user rating feedback and corrective notes for a specific agent output.
// Packages thumbs up/down ratings, reason classifications, and text corrections.
// Forwards feedback directly into the model evaluation loop for future tuning.
export async function submitAgentOutputFeedback(
  agentOutputId: string,
  payload: { rating: "up" | "down"; note?: string; reasonCode?: FeedbackReasonCode; correction?: string }
): Promise<any> {
  return apiClient(`/agent-outputs/${agentOutputId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

