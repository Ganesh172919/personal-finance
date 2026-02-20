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

export type WorkflowTemplate = {
  template_key: string;
  plugin_key: string;
  plugin_version: string | null;
  name: string;
  description: string;
  request: CreateWorkflowRequest;
};

export type ListWorkflowTemplatesResponse = {
  org_id: string;
  templates: WorkflowTemplate[];
  request_id: string;
};

export async function listWorkflowTemplates(): Promise<ListWorkflowTemplatesResponse> {
  return apiClient("/v1/workflows/templates") as Promise<ListWorkflowTemplatesResponse>;
}
