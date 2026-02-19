import { apiClient } from "../core";

import type {
  CreateWorkflowRequest as SdkCreateWorkflowRequest,
  CreateWorkflowResponse as SdkCreateWorkflowResponse,
  ListWorkflowsResponse as SdkListWorkflowsResponse,
  RunWorkflowRequest as SdkRunWorkflowRequest,
  RunWorkflowResponse as SdkRunWorkflowResponse,
} from "@finwise/sdk-ts";

export type CreateWorkflowRequest = SdkCreateWorkflowRequest;
export type CreateWorkflowResponse = SdkCreateWorkflowResponse;
export type ListWorkflowsResponse = SdkListWorkflowsResponse;
export type RunWorkflowRequest = SdkRunWorkflowRequest;
export type RunWorkflowResponse = SdkRunWorkflowResponse;

export type Workflow = NonNullable<ListWorkflowsResponse["workflows"]>[number];

export async function listWorkflows(): Promise<ListWorkflowsResponse> {
  return apiClient("/v1/workflows");
}

export async function createWorkflow(body: CreateWorkflowRequest): Promise<CreateWorkflowResponse> {
  return apiClient("/v1/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function runWorkflow(workflowId: string, body: RunWorkflowRequest = {}): Promise<RunWorkflowResponse> {
  return apiClient(`/v1/workflows/${workflowId}/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

