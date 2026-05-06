/**
 * @fileoverview V1 Financial Story Sharing API
 *
 * Enables users to create shareable "financial story" links -- public,
 * read-only snapshots of their financial health that can be viewed by
 * anyone with the link (no authentication required).
 *
 * Key concepts:
 * - **Share Creation**: `createFinancialStoryShare` generates a time-limited
 *   share token and URL. The creator controls what data is included
 *   (goals, milestones, deadlines) and how long the share is valid.
 * - **Public Access**: `getPublicFinancialStoryShare` fetches the share
 *   payload using only the token -- no auth needed. The response includes
 *   a summary (health percentage, assets, savings), goals, and milestones.
 * - **Token Security**: Tokens are URL-encoded and passed as path params.
 *   The response includes `token_prefix` for display but the full token
 *   is only shown once at creation time.
 */

import { apiClient } from "../core";

/** Options for creating a financial story share. */
export type FinancialStoryShareCreateRequest = {
  expires_in_days?: number;
  include_goal_names?: boolean;
  include_goal_deadlines?: boolean;
  include_milestones?: boolean;
  max_milestones?: number;
};

export type FinancialStoryShareCreateResponse = {
  share: {
    id: string;
    type: string;
    token_prefix: string;
    expires_at: string;
    share_url: string;
  };
  token: string;
  request_id?: string;
};

/** Create a shareable financial story link with configurable data inclusion and expiry. */
export async function createFinancialStoryShare(
  body: FinancialStoryShareCreateRequest = {}
): Promise<FinancialStoryShareCreateResponse> {
  return apiClient("/v1/shares/financial-story", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PublicSharePayloadFinancialStory = {
  type: "financial_story";
  generated_at: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  summary: {
    health_percentage: number;
    total_assets: number;
    savings_balance: number;
    goals_active: number;
    milestones_count: number;
  };
  goals: Array<{
    name: string;
    target: number;
    current: number;
    deadline?: string;
    priority: number;
  }>;
  milestones: Array<{
    agent_type: string;
    title: string;
    description: string;
    timestamp: string;
  }>;
  profile_updated_at?: string;
};

export type PublicFinancialStoryShareResponse = {
  share_id: string;
  type: "financial_story";
  expires_at: string | null;
  payload: PublicSharePayloadFinancialStory;
  request_id?: string;
};

/**
 * Fetch a public financial story by its share token (no auth required).
 * The token is URL-encoded to handle special characters safely.
 */
export async function getPublicFinancialStoryShare(token: string): Promise<PublicFinancialStoryShareResponse> {
  const safe = encodeURIComponent(String(token || ""));
  return apiClient(`/v1/public/shares/financial-story/${safe}`);
}
