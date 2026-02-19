import { apiClient } from "../core";

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

export async function getPublicFinancialStoryShare(token: string): Promise<PublicFinancialStoryShareResponse> {
  const safe = encodeURIComponent(String(token || ""));
  return apiClient(`/v1/public/shares/financial-story/${safe}`);
}
