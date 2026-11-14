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

// Defines configuration parameters for generating a public financial snapshot link.
// Configures link expiration horizons, goal visibility, and milestone inclusion flags.
// Sanitizes what personal financial data is shared with external link recipients.
/** Options for creating a financial story share. */
export type FinancialStoryShareCreateRequest = {
  expires_in_days?: number;
  include_goal_names?: boolean;
  include_goal_deadlines?: boolean;
  include_milestones?: boolean;
  max_milestones?: number;
};

// Encapsulates the response produced upon generating a shareable financial story link.
// Delivers the complete one-time security token, share URL, and token prefix details.
// Enables users to copy temporary sharing links directly to their device clipboard.
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

// Provisions a time-limited public sharing token for a financial story snapshot.
// Dispatches an authenticated POST request with privacy and inclusion criteria.
// Returns the public access link along with expiration metadata.
/** Create a shareable financial story link with configurable data inclusion and expiry. */
export async function createFinancialStoryShare(
  body: FinancialStoryShareCreateRequest = {}
): Promise<FinancialStoryShareCreateResponse> {
  return apiClient("/shares/financial-story", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Represents the sanitized financial story content visible to public link recipients.
// Unpacks overall health scores, asset summaries, active goals, and milestone achievements.
// Serves as the public data contract rendered in unauthenticated web views.
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

// Encapsulates the public response payload received when accessing a shared link.
// Combines share identifiers, expiration validity timestamps, and financial story data.
// Powers public read-only milestone celebration cards and progress dashboards.
export type PublicFinancialStoryShareResponse = {
  share_id: string;
  type: "financial_story";
  expires_at: string | null;
  payload: PublicSharePayloadFinancialStory;
  request_id?: string;
};

// Retrieves a public read-only financial story snapshot using its sharing token.
// Dispatches an unauthenticated GET request passing the sanitized URL token.
// Renders the external snapshot view for family members, advisors, or peers.
/**
 * Fetch a public financial story by its share token (no auth required).
 * The token is URL-encoded to handle special characters safely.
 */
export async function getPublicFinancialStoryShare(token: string): Promise<PublicFinancialStoryShareResponse> {
  const safe = encodeURIComponent(String(token || ""));
  return apiClient(`/public/shares/financial-story/${safe}`);
}
