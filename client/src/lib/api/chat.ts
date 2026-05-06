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

/** Fetch all agent outputs for a specific user */
export async function getAgentOutputs(userId: string): Promise<any> {
  return apiClient(`/agent-outputs/user/${userId}`);
}

/** Shape of a recent agent output in the activity feed */
export interface RecentAgentOutput {
  id: string;
  type: string;
  created_at: string;
  linked_task_ids: string[];
}

/** Fetch recent agent outputs (activity feed) with input validation */
export async function getRecentAgentOutputs(limit = 20): Promise<{ outputs: RecentAgentOutput[]; request_id?: string }> {
  // Clamp limit to [1, 100] to prevent abuse
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return apiClient(`/agent-outputs/recent?limit=${safeLimit}`);
}

/**
 * Submit user feedback (thumbs up/down) on an AI agent output.
 * Used for the AI feedback loop to improve model selection.
 */
export async function submitAgentOutputFeedback(
  agentOutputId: string,
  payload: { rating: "up" | "down"; note?: string }
): Promise<any> {
  return apiClient(`/agent-outputs/${agentOutputId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

