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

export type ContentPreferences = {
  spending_summary: boolean;
  budget_alerts: boolean;
  upcoming_bills: boolean;
  financial_tips: boolean;
  portfolio_news: boolean;
  weekly_health_score: boolean;
  actionable_recommendations: boolean;
};

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

export type GetPreferencesResponse = {
  preference: NewsletterPreference;
  request_id?: string;
};

export type UpdatePreferencesResponse = {
  preference: NewsletterPreference;
  request_id?: string;
};

export type PreviewNewsletterResponse = {
  html: string;
  sections: Record<string, unknown>;
  request_id?: string;
};

export type SendNewsletterResponse = {
  message: string;
  request_id?: string;
};

export type NewsletterHistoryItem = {
  id: string;
  last_sent_at: string | null;
  is_subscribed: boolean;
  delivery_time: string;
  timezone: string;
};

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

/**
 * Fetch the current user's newsletter preferences.
 * Creates default preferences if none exist.
 */
export async function getNewsletterPreferences(): Promise<GetPreferencesResponse> {
  return apiClient("/newsletter/preferences", { method: "GET" });
}

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

/**
 * Generate a newsletter preview without sending it.
 */
export async function previewNewsletter(): Promise<PreviewNewsletterResponse> {
  return apiClient("/newsletter/preview", { method: "POST" });
}

/**
 * Immediately generate and send the newsletter to the current user.
 */
export async function sendNewsletterNow(): Promise<SendNewsletterResponse> {
  return apiClient("/newsletter/send-now", { method: "POST" });
}

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
