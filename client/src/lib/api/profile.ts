/**
 * @fileoverview User Financial Profile, Goals & Debts API
 *
 * Manages the user's core financial profile (income, expenses, savings),
 * savings goals, and debt records. These endpoints are the foundation for
 * the AI-powered financial planning system -- the profile data feeds into
 * the LLM context so the AI can generate personalised advice.
 *
 * Key concepts:
 * - **Financial Profile**: A snapshot of the user's financial health
 *   (annual income, monthly expenses, current savings). Updated via PUT
 *   which replaces the whole profile.
 * - **Goals**: Savings targets with a name, deadline, and priority.
 *   Goals can be created, updated (PATCH for partial updates), and deleted.
 *   The `current` field defaults to 0 if omitted at creation time.
 * - **Debts**: Outstanding obligations with balance, interest rate, minimum
 *   payment, and type. Like goals, they support full CRUD.
 *
 * All functions delegate to the shared `apiClient` for consistent
 * authentication, error handling, and organisation context.
 */

import { apiClient } from "./core";

/**
 * Fetch the current user's financial profile.
 * The `_userId` parameter is currently unused -- the server always returns
 * the profile for the authenticated user.
 */
export async function getFinancialProfile(_userId?: string): Promise<any> {
  return apiClient("/financial-profiles/me");
}

/**
 * Replace the current user's financial profile.
 * Uses PUT semantics: the entire profile object is replaced with `payload`.
 */
export async function updateFinancialProfile(payload: any): Promise<any> {
  return apiClient("/financial-profiles/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Shape of the payload required to create or update a savings goal. */
export type GoalPayload = {
  name: string;
  target: number;
  current?: number;
  deadline: string;
  priority: number;
};

/**
 * Create a new savings goal.
 * Defaults `current` to 0 when not provided by the caller.
 */
export async function createGoal(payload: GoalPayload): Promise<{ goal: any }> {
  return apiClient("/goals", {
    method: "POST",
    body: JSON.stringify({ ...payload, current: payload.current ?? 0 }),
  });
}

/** Partially update an existing savings goal by its ID. */
export async function updateGoal(goalId: string, payload: Partial<GoalPayload>): Promise<{ goal: any }> {
  return apiClient(`/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Permanently delete a savings goal by its ID. */
export async function deleteGoal(goalId: string): Promise<{ goal_id: string }> {
  return apiClient(`/goals/${goalId}`, {
    method: "DELETE",
  });
}

/** Shape of the payload required to create or update a debt record. */
export type DebtPayload = {
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
};

/** Create a new debt record. */
export async function createDebt(payload: DebtPayload): Promise<{ debt: any }> {
  return apiClient("/debts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Partially update an existing debt record by its ID. */
export async function updateDebt(debtId: string, payload: Partial<DebtPayload>): Promise<{ debt: any }> {
  return apiClient(`/debts/${debtId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Permanently delete a debt record by its ID. */
export async function deleteDebt(debtId: string): Promise<{ debt_id: string }> {
  return apiClient(`/debts/${debtId}`, {
    method: "DELETE",
  });
}
