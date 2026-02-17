import { apiClient } from "./core";

export async function getAgentOutputs(userId: string): Promise<any> {
  return apiClient(`/agent-outputs/user/${userId}`);
}

export interface RecentAgentOutput {
  id: string;
  type: string;
  created_at: string;
  linked_task_ids: string[];
}

export async function getRecentAgentOutputs(limit = 20): Promise<{ outputs: RecentAgentOutput[]; request_id?: string }> {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return apiClient(`/agent-outputs/recent?limit=${safeLimit}`);
}

export async function submitAgentOutputFeedback(
  agentOutputId: string,
  payload: { rating: "up" | "down"; note?: string }
): Promise<any> {
  return apiClient(`/agent-outputs/${agentOutputId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

