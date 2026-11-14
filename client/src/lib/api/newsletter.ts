/**
 * @fileoverview Newsletter API client module.
 *
 * Provides functions for managing newsletter preferences,
 * previewing content, triggering sends, and fetching history.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * Newsletter API Module
 * ├── 1. Client Types & Contracts
 * │   ├── ContentPreferences (spending, alerts, bills, tips, health score)
 * │   ├── NewsletterPreference (user preference model)
 * │   ├── UpdateNewsletterPreferencesRequest (partial update payload)
 * │   └── NewsletterPreviewResponse & SendNowResponse
 * └── 2. Core API Methods
 *     ├── getNewsletterPreferences: GET /api/v1/newsletter/preferences
 *     ├── updateNewsletterPreferences: PUT /api/v1/newsletter/preferences
 *     ├── previewNewsletter: POST /api/v1/newsletter/preview
 *     ├── sendNewsletterNow: POST /api/v1/newsletter/send-now
 *     └── getNewsletterHistory: GET /api/v1/newsletter/history
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               Frontend Component (NewsletterSettings)         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |           Call typed method in lib/api/newsletter.ts          |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |             Axios apiClient with Auth Headers & Org           |
 *   |  - Automatic Bearer token attachment                          |
 *   |  - X-Org-ID and CSRF token propagation                       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   | Delivered to /api/v1/newsletter endpoints on Node.js Server   |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module lib/api/newsletter
 */

import { apiClient } from "./core";

// ─── Types ────────────────────────────────────────────────

// Models granular user content topic toggles for automated newsletter digests.
// Controls inclusion of spending summaries, budget alerts, bills, tips, and scores.
// Supplies configuration settings governing dynamic template generation.
export type ContentPreferences = {
  spending_summary: boolean;
  budget_alerts: boolean;
  upcoming_bills: boolean;
  financial_tips: boolean;
  portfolio_news: boolean;
  weekly_health_score: boolean;
  actionable_recommendations: boolean;
};

// Represents the persisted user subscription preferences model for financial newsletters.
// Encompasses active subscription states, delivery schedules, timezones, and content flags.
// Persists the core preferences profile governing automated email dispatch routines.
export type NewsletterPreference = {
  id: string;
  user_id: string;
  org_id: string;
  is_subscribed: boolean;
  delivery_time: string;
  timezone: string;
  content_preferences: ContentPreferences;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

// Defines the partial update payload used to modify user newsletter preferences.
// Supports selective updates to delivery schedules, timezones, or topical categories.
// Validates preference modifications submitted from settings management forms.
export type UpdateNewsletterPreferencesRequest = {
  isSubscribed?: boolean;
  deliveryTime?: string;
  timezone?: string;
  contentPreferences?: {
    spendingSummary?: boolean;
    budgetAlerts?: boolean;
    upcomingBills?: boolean;
    financialTips?: boolean;
    portfolioNews?: boolean;
    weeklyHealthScore?: boolean;
    actionableRecommendations?: boolean;
  };
};

// Models the API response structure returned when querying newsletter preferences.
// Bundles the active preference record alongside server request tracing IDs.
// Powers client settings forms with initial user newsletter preference values.
export type GetPreferencesResponse = {
  preference: NewsletterPreference;
  request_id?: string;
};

// Models the API response envelope returned after updating newsletter preferences.
// Delivers the updated preference entity confirming modified configuration values.
// Refreshes client-side preference caches following successful form submissions.
export type UpdatePreferencesResponse = {
  preference: NewsletterPreference;
  request_id?: string;
};

// Models the generated preview payload returned before an email newsletter is sent.
// Contains fully compiled HTML markup and structured section data dictionaries.
// Enables live rendering of personalized email previews in client settings modals.
export type PreviewNewsletterResponse = {
  html: string;
  sections: Record<string, unknown>;
  request_id?: string;
};

// Encapsulates the response returned after triggering an on-demand newsletter dispatch.
// Confirms that generation and email delivery pipelines completed successfully.
// Supplies user feedback confirming manual on-demand digest transmission.
export type SendNewsletterResponse = {
  message: string;
  request_id?: string;
};

// Represents an individual historical delivery event record in the newsletter log.
// Captures delivery timestamps, subscriber states, schedules, and active timezones.
// Feeds historical audit tables displaying past newsletter delivery milestones.
export type NewsletterHistoryItem = {
  id: string;
  last_sent_at: string | null;
  is_subscribed: boolean;
  delivery_time: string;
  timezone: string;
};

// Encapsulates the paginated response containing newsletter delivery histories.
// Supplies the array of historical delivery records alongside pagination counters.
// Powers paginated audit tables tracking past automated digest distributions.
export type GetHistoryResponse = {
  history: NewsletterHistoryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  request_id?: string;
};

// ─── API Functions ────────────────────────────────────────

// Retrieves active user newsletter preferences including delivery time and active topics.
// Fallback creates default settings if no previous preferences record is located.
// Dispatches an authenticated GET request to the preferences endpoint.
/**
 * Fetch the current user's newsletter preferences.
 * Creates default preferences if none exist.
 */
export async function getNewsletterPreferences(): Promise<GetPreferencesResponse> {
  return apiClient("/newsletter/preferences", { method: "GET" });
}

// Persists updated newsletter frequency and topic selections for the user.
// Submits modified preferences payload formatted as JSON to the server.
// Dispatches an authenticated PUT request to update delivery configurations.
/**
 * Update the current user's newsletter preferences.
 */
export async function updateNewsletterPreferences(
  prefs: UpdateNewsletterPreferencesRequest
): Promise<UpdatePreferencesResponse> {
  return apiClient("/newsletter/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}

// Generates an on-demand HTML draft preview of the upcoming financial newsletter.
// Computes topic aggregation and dynamic formatting without delivering to mailboxes.
// Dispatches an authenticated POST request to generate the draft layout.
/**
 * Generate a newsletter preview without sending it.
 */
export async function previewNewsletter(): Promise<PreviewNewsletterResponse> {
  return apiClient("/newsletter/preview", { method: "POST" });
}

// Triggers an immediate generation and dispatch of the personalized newsletter.
// Delivers the compiled financial summary directly to the subscriber's inbox.
// Dispatches an authenticated POST request to trigger the immediate send job.
/**
 * Immediately generate and send the newsletter to the current user.
 */
export async function sendNewsletterNow(): Promise<SendNewsletterResponse> {
  return apiClient("/newsletter/send-now", { method: "POST" });
}

// Retrieves paginated delivery audit history logs for the current subscriber.
// Encodes limit and offset pagination parameters onto the query string.
// Dispatches an authenticated GET request to inspect past delivery milestones.
/**
 * Fetch newsletter delivery history for the current user.
 */
export async function getNewsletterHistory(
  limit = 10,
  offset = 0
): Promise<GetHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiClient(`/newsletter/history?${params.toString()}`, { method: "GET" });
}
