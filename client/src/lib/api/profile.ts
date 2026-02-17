import { apiClient } from "./core";

export async function getFinancialProfile(_userId?: string): Promise<any> {
  return apiClient("/financial-profiles/me");
}

export async function updateFinancialProfile(payload: any): Promise<any> {
  return apiClient("/financial-profiles/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type GoalPayload = {
  name: string;
  target: number;
  current?: number;
  deadline: string;
  priority: number;
};

export async function createGoal(payload: GoalPayload): Promise<{ goal: any }> {
  return apiClient("/goals", {
    method: "POST",
    body: JSON.stringify({ ...payload, current: payload.current ?? 0 }),
  });
}

export async function updateGoal(goalId: string, payload: Partial<GoalPayload>): Promise<{ goal: any }> {
  return apiClient(`/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteGoal(goalId: string): Promise<{ goal_id: string }> {
  return apiClient(`/goals/${goalId}`, {
    method: "DELETE",
  });
}

export type DebtPayload = {
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
};

export async function createDebt(payload: DebtPayload): Promise<{ debt: any }> {
  return apiClient("/debts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDebt(debtId: string, payload: Partial<DebtPayload>): Promise<{ debt: any }> {
  return apiClient(`/debts/${debtId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDebt(debtId: string): Promise<{ debt_id: string }> {
  return apiClient(`/debts/${debtId}`, {
    method: "DELETE",
  });
}

