/**
 * @fileoverview Client API client for Personalized Follow-Through & Ranking Engine.
 */

import { apiClient } from "./core";

// Categorizes financial notification and action signal source domains.
// Spans tasks, goals, budgets, reminders, recurring items, debts, and accounts.
// Guides prioritization scoring models when ranking cross-domain action suggestions.
export type FollowThroughDomain =
  | "task"
  | "goal"
  | "budget"
  | "reminder"
  | "recurring"
  | "debt"
  | "account";

// Defines interactive feedback actions users can perform on recommendation signals.
// Allows users to upvote helpful suggestions, dismiss noise, or mark items complete.
// Feeds user behavior logs to personalize machine learning ranking affinities.
export type FollowThroughAction = "upvote" | "dismiss" | "complete";

// Models an individual prioritized financial recommendation signal item.
// Encapsulates priority score, urgency weighting, impact metrics, and target action URLs.
// Powers personalized next-action cards and prioritized notification widgets.
export interface FollowThroughItem {
  id: string;
  domain: FollowThroughDomain;
  title: string;
  description: string;
  priorityScore: number;
  priorityTier: "critical" | "high" | "medium" | "low";
  urgency: number;
  impact: number;
  actionUrl: string;
  isOverdue: boolean;
  dueDate?: string | null;
  rank: number;
  metadata?: Record<string, unknown>;
}

// Represents user preferences governing automated recommendation frequencies and weights.
// Holds domain affinity weights, risk tolerances, and preferred update cadences.
// Tailors ranking algorithms to individual user working styles and financial priorities.
export interface FollowThroughPreferences {
  focusDomains: Record<string, number>;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  preferredCadence: "daily" | "weekly" | "biweekly";
  totalFeedbackEvents?: number;
}

// Models the complete recommendation engine API response payload.
// Delivers ranked recommendation items alongside learned domain affinities and preferences.
// Supplies the data required to populate personalized action centers and feed widgets.
export interface FollowThroughRecommendationsResponse {
  items: FollowThroughItem[];
  totalSignals: number;
  learnedAffinities: Record<string, number>;
  preferences: FollowThroughPreferences;
}

// Fetches the top prioritized financial follow-through recommendations for the user.
// Accepts an optional item count limit to bound recommendation list queries.
// Dispatches an authenticated request to retrieve ranked suggestions and affinity weights.
export async function getFollowThroughRecommendations(
  limit: number = 10
): Promise<FollowThroughRecommendationsResponse> {
  const res = await apiClient<{ status: string; data: FollowThroughRecommendationsResponse }>(
    `/api/follow-through/recommendations?limit=${encodeURIComponent(limit)}`
  );
  return res.data;
}

// Records explicit user feedback interactions regarding a recommendation signal.
// Captures user actions like upvoting, dismissals, or completions with optional reasons.
// Immediately updates client feedback history counters to refine machine learning scoring.
export async function recordFollowThroughFeedback(params: {
  signalId: string;
  domain: FollowThroughDomain;
  action: FollowThroughAction;
  reason?: string;
}): Promise<{ message: string; feedbackHistoryCount: number }> {
  const res = await apiClient<{
    status: string;
    data: { message: string; feedbackHistoryCount: number };
  }>("/api/follow-through/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.data;
}

// Queries the user's active recommendation preferences and domain weighting parameters.
// Retrieves current focus domains, risk tolerance settings, and notification frequency.
// Informs preference configuration forms and settings panels within the user dashboard.
export async function getFollowThroughPreferences(): Promise<FollowThroughPreferences> {
  const res = await apiClient<{ status: string; data: FollowThroughPreferences }>(
    "/api/follow-through/preferences"
  );
  return res.data;
}

// Updates user recommendation preferences and domain importance weighting parameters.
// Submits partial preference updates including cadence changes and domain emphasis.
// Immediately reconfigures ranking parameters governing future recommendation feeds.
export async function updateFollowThroughPreferences(
  updates: Partial<FollowThroughPreferences>
): Promise<FollowThroughPreferences> {
  const res = await apiClient<{ status: string; data: FollowThroughPreferences }>(
    "/api/follow-through/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }
  );
  return res.data;
}
