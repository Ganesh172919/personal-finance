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
export type AutopilotRun = AutopilotRunResponse["run"];

export async function createAutopilotPlan(body: AutopilotPlanRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/plan", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

export async function simulateAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

export async function approveAutopilotRun(body: AutopilotApproveRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/approve", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

export async function executeAutopilotRun(body: AutopilotRunIdRequest): Promise<AutopilotRunResponse> {
  return apiClient("/v1/autopilot/execute", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutopilotRunResponse>;
}

export async function getAutopilotRun(runId: string): Promise<AutopilotRunResponse> {
  return apiClient(`/v1/autopilot/runs/${encodeURIComponent(runId)}`) as Promise<AutopilotRunResponse>;
}


