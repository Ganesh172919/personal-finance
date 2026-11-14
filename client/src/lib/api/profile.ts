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

// Fetches the current authenticated user's snapshot financial profile.
// Supplies income, expense, and liquid asset baselines to planning workflows.
// Dispatches an authenticated GET request to the profile endpoint.
/**
 * Fetch the current user's financial profile.
 * The `_userId` parameter is currently unused -- the server always returns
 * the profile for the authenticated user.
 */
export async function getFinancialProfile(_userId?: string): Promise<any> {
  return apiClient("/financial-profiles/me");
}

// Overwrites the complete financial profile snapshot for the user account.
// Serializes income parameters and expenditure aggregates into the request body.
// Dispatches an authenticated PUT request returning updated profile state.
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

// Defines the parameter contract for creating or editing user savings goals.
// Encapsulates target currency amounts, dead-line dates, and priority scores.
// Supports optional current funding levels that default to zero when absent.
/** Shape of the payload required to create or update a savings goal. */
export type GoalPayload = {
  name: string;
  target: number;
  current?: number;
  deadline: string;
  priority: number;
};

// Records a new savings milestone goal associated with the user account.
// Enforces a fallback zero value for the current savings balance parameter.
// Dispatches an authenticated POST request to store the goal record.
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

// Modifies selected fields on an existing target savings goal entity.
// Accepts partial goal parameters allowing selective field updates.
// Dispatches an authenticated PATCH request to the targeted goal ID.
/** Partially update an existing savings goal by its ID. */
export async function updateGoal(goalId: string, payload: Partial<GoalPayload>): Promise<{ goal: any }> {
  return apiClient(`/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Permanently removes a designated financial savings goal from the account.
// Unlinks tracking metrics and invalidates associated milestone targets.
// Dispatches an authenticated DELETE request with the unique goal identifier.
/** Permanently delete a savings goal by its ID. */
export async function deleteGoal(goalId: string): Promise<{ goal_id: string }> {
  return apiClient(`/goals/${goalId}`, {
    method: "DELETE",
  });
}

// Defines the data attributes needed to register or edit outstanding debts.
// Tracks outstanding principal balances, interest percentages, and payment minimums.
// Identifies loan and credit types for debt paydown snowball or avalanche models.
/** Shape of the payload required to create or update a debt record. */
export type DebtPayload = {
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
};

// Registers a new debt or liability liability record under the active user.
// Serializes principal balances, interest rates, and minimum dues to JSON.
// Dispatches an authenticated POST request to persist the liability record.
/** Create a new debt record. */
export async function createDebt(payload: DebtPayload): Promise<{ debt: any }> {
  return apiClient("/debts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Updates attributes on an existing debt obligation identified by its ID.
// Transmits partial debt parameters such as adjusted rates or updated balances.
// Dispatches an authenticated PATCH request to update the target obligation.
/** Partially update an existing debt record by its ID. */
export async function updateDebt(debtId: string, payload: Partial<DebtPayload>): Promise<{ debt: any }> {
  return apiClient(`/debts/${debtId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Removes a specified debt or loan record permanently from user accounting.
// Frees debt balance aggregates and eliminates associated repayment schedules.
// Dispatches an authenticated DELETE request addressing the debt identifier.
/** Permanently delete a debt record by its ID. */
export async function deleteDebt(debtId: string): Promise<{ debt_id: string }> {
  return apiClient(`/debts/${debtId}`, {
    method: "DELETE",
  });
}
