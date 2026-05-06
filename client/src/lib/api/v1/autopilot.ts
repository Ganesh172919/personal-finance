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

export type AutopilotPlanRequest = SdkAutopilotPlanRequest;
export type AutopilotRunIdRequest = SdkAutopilotRunIdRequest;
export type AutopilotApproveRequest = SdkAutopilotApproveRequest;
export type AutopilotRunResponse = SdkAutopilotRunResponse;
/** Extracted run object from the response for convenience. */
export type AutopilotRun = AutopilotRunResponse["run"];

/** Phase 1: Generate an AI-powered financial action plan. */
export async function createAutopilotPlan(body: AutopilotPlanRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/plan", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

/** Phase 2: Simulate the plan in a dry-run sandbox (no real changes). */
export async function simulateAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

/** Phase 3: User approves the simulated plan for execution. */
export async function approveAutopilotRun(body: AutopilotApproveRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/approve", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

/** Phase 4: Execute the approved plan, applying real financial changes. */
export async function executeAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/execute", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

/** Fetch the current state of an autopilot run by ID. */
export async function getAutopilotRun(runId: string): Promise<AutopilotRunResponse> {
  return apiClient(`/v1/autopilot/runs/${encodeURIComponent(runId)}`) as Promise<AutopilotRunResponse>;
}


