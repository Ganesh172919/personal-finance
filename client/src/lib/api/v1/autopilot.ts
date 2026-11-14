/**
 * @fileoverview V1 Autopilot Automation API
 *
 * Implements a four-phase autonomous financial action pipeline:
 *
 * 1. **Plan** -- The AI generates a proposed plan of financial actions
 *    (transactions, goal updates, etc.) based on the user's data.
 * 2. **Simulate** -- The plan is executed in a dry-run sandbox to preview
 *    what would happen without making real changes.
 * 3. **Approve** -- The user reviews the simulation and gives explicit
 *    approval to proceed.
 * 4. **Execute** -- The approved plan is applied to the user's real
 *    financial data.
 *
 * Each phase returns an `AutopilotRun` object that tracks the run's
 * status, proposed actions, simulation results, and execution outcome.
 * The `runId` links all phases together.
 *
 * This pattern ensures the AI never makes unsupervised financial changes --
 * the user always has a chance to review and approve.
 */

import { apiClient } from "../core";

import type {
  AutopilotApproveRequest as SdkAutopilotApproveRequest,
  AutopilotPlanRequest as SdkAutopilotPlanRequest,
  AutopilotRunIdRequest as SdkAutopilotRunIdRequest,
  AutopilotRunResponse as SdkAutopilotRunResponse,
} from "@/types/apiTypes";

// Defines input requirements for generating an autonomous financial action plan.
// Passes user objectives, time horizons, and financial context parameters to the planner.
// Feeds the initial planning phase of the supervised autopilot execution pipeline.
export type AutopilotPlanRequest = SdkAutopilotPlanRequest;

// Encapsulates the unique execution run identifier for referencing an autopilot session.
// Links downstream simulation, approval, and execution phases to the original run.
// Ensures strict traceability across the four-stage autonomous workflow pipeline.
export type AutopilotRunIdRequest = SdkAutopilotRunIdRequest;

// Defines authorization parameters submitted to confirm an autopilot action plan.
// Confirms that the user has reviewed dry-run simulation outcomes and authorized execution.
// Unlocks the final automated mutation stage across live account records.
export type AutopilotApproveRequest = SdkAutopilotApproveRequest;

// Encapsulates the server response payload representing an active or completed run.
// Packages comprehensive run lifecycle status, planned actions, and outcome results.
// Powers visual progress indicators and review dialogs across autopilot interfaces.
export type AutopilotRunResponse = SdkAutopilotRunResponse;

// Represents an individual autopilot execution instance and its internal state.
// Tracks execution stage progression, simulated impacts, and final applied mutations.
// Serves as the central data entity displayed across autonomous financial dashboards.
/** Extracted run object from the response for convenience. */
export type AutopilotRun = AutopilotRunResponse["run"];

// Phase 1: Initiates the generation of an AI-driven financial optimization plan.
// Dispatches an authenticated POST request submitting user planning criteria.
// Returns an initialized autopilot run entity containing candidate actions.
/** Phase 1: Generate an AI-powered financial action plan. */
export async function createAutopilotPlan(body: AutopilotPlanRequest): Promise<AutopilotRunResponse> {
  return apiClient("/autopilot/plan", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

// Phase 2: Performs a sandbox simulation of proposed financial modifications.
// Dispatches an authenticated POST request executing a risk-free dry-run evaluation.
// Returns projected balance changes, goal progress impacts, and risk warnings.
/** Phase 2: Simulate the plan in a dry-run sandbox (no real changes). */
export async function simulateAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/autopilot/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

// Phase 3: Commits user consent and explicit authorization for a simulated plan.
// Dispatches an authenticated POST request recording human-in-the-loop validation.
// Transitions the autopilot run status to approved, enabling live execution.
/** Phase 3: User approves the simulated plan for execution. */
export async function approveAutopilotRun(body: AutopilotApproveRequest): Promise<AutopilotRunResponse> {
  return apiClient("/autopilot/approve", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

// Phase 4: Executes an approved financial action plan against live production data.
// Dispatches an authenticated POST request applying real ledger and goal mutations.
// Returns finalized execution outcomes and transaction creation receipts.
/** Phase 4: Execute the approved plan, applying real financial changes. */
export async function executeAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/autopilot/execute", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

// Queries the real-time execution status and result summary of an autopilot run.
// Dispatches an authenticated GET request addressing the specified run identifier.
// Allows client polling and status recovery for asynchronous autonomous actions.
/** Fetch the current state of an autopilot run by ID. */
export async function getAutopilotRun(runId: string): Promise<AutopilotRunResponse> {
  return apiClient(`/autopilot/runs/${encodeURIComponent(runId)}`) as Promise<AutopilotRunResponse>;
}


