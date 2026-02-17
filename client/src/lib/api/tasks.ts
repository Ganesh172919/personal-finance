import { apiClient } from "./core";
import type { MutationSource, TransactionType } from "./transactions";

export type TaskStatus = "open" | "completed" | "dismissed";
export type TaskEffect =
  | {
      type: "transaction";
      transaction: {
        amount: number;
        category: string;
        description: string;
        date?: string;
        tx_type: TransactionType;
      };
    }
  | {
      type: "goal_progress";
      goal_id: string;
      amount: number;
      mode?: "increment" | "set";
    }
  | {
      type: "debt_payment";
      debt_id: string;
      amount: number;
    }
  | {
      type: "profile_update";
      updates: {
        annual_income?: number;
        monthly_expenses?: number;
        savings?: number;
      };
    };

export interface Task {
  _id: string;
  source?: { agentOutputId?: string; chatMessageId?: string; requestId?: string };
  bucket: 7 | 30 | 365;
  title: string;
  why: string;
  steps: string[];
  priority: "low" | "medium" | "high";
  expected_impact: string;
  kind: string;
  dueDate?: string;
  status: TaskStatus;
  completedAt?: string;
  completionEvidence?: {
    note?: string;
    completedAt?: string;
    effects?: TaskEffect[];
  };
  appliedAt?: string;
  appliedSummary?: {
    transactions: string[];
    goals: string[];
    debts: string[];
    profileUpdated: boolean;
  };
  applyStatus?: "pending" | "succeeded" | "failed";
  applyErrorCode?: string;
  applyIdempotencyKey?: string;
  actionLinkId?: string;
  outcomeRefs?: string[];
}

export async function createTasksFromPlan(payload: {
  source?: { agentOutputId?: string; chatMessageId?: string; requestId?: string };
  plan: any;
}): Promise<{ created: number; tasks: Task[] }> {
  return apiClient("/tasks/from-plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTasks(params: { status?: TaskStatus; limit?: number } = {}): Promise<{ tasks: Task[] }> {
  const status = params.status || "open";
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 50));
  const qs = new URLSearchParams({ status, limit: String(limit) });
  return apiClient(`/tasks?${qs.toString()}`);
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  options: {
    completed_at?: string;
    note?: string;
    effects?: TaskEffect[];
    completion_evidence?: { note?: string; completed_at?: string };
    apply_status?: "pending" | "succeeded" | "failed";
    apply_error_code?: string;
  } = {}
): Promise<{ task: Task }> {
  return apiClient(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...options }),
  });
}

export async function applyTaskEffects(
  taskId: string,
  payload: { idempotency_key?: string; completed_at?: string; note?: string; effects?: TaskEffect[] } = {}
): Promise<{
  task: Task;
  applied_effects: {
    transactions: string[];
    goals: string[];
    debts: string[];
    profile_updated: boolean;
  };
  links: {
    action_link_id: string;
    task_id: string;
    transaction_ids: string[];
    goal_ids: string[];
    debt_ids: string[];
  };
  provenance: MutationSource;
  idempotent_replay?: boolean;
  request_id?: string;
}> {
  return apiClient(`/tasks/${taskId}/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTaskById(taskId: string): Promise<{
  task: Task;
  source?: {
    agent_output: null | {
      id: string;
      request_id?: string;
      user_input_snippet: string;
      title?: string;
    };
  };
  request_id?: string;
}> {
  return apiClient(`/tasks/${taskId}`);
}
