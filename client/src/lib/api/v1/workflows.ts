/**
 * @fileoverview V1 Workflow Automation API
 *
 * Manages user-defined automation workflows that chain together platform
 * actions (e.g., "when a transaction exceeds $100, notify me and log it").
 *
 * Key concepts:
 * - **Workflow**: A named automation rule with a trigger, conditions, and
 *   actions. Created by the user and stored server-side.
 * - **Run**: Triggering a workflow creates a run that executes the defined
 *   actions. Runs can be monitored for success/failure.
 * - **Templates**: Pre-built workflow definitions provided by plugins.
 *   Users can instantiate templates to quickly set up common automations
 *   without building from scratch.
 *
 * All endpoints are scoped to the active organisation via the `apiClient`.
 */

import { apiClient } from "../core";

import type {
  CreateWorkflowRequest as SdkCreateWorkflowRequest,
  CreateWorkflowResponse as SdkCreateWorkflowResponse,
  ListWorkflowsResponse as SdkListWorkflowsResponse,
  RunWorkflowRequest as SdkRunWorkflowRequest,
  RunWorkflowResponse as SdkRunWorkflowResponse,
} from "@/types/apiTypes";

export type CreateWorkflowRequest = SdkCreateWorkflowRequest;
export type CreateWorkflowResponse = SdkCreateWorkflowResponse;
export type ListWorkflowsResponse = SdkListWorkflowsResponse;
export type RunWorkflowRequest = SdkRunWorkflowRequest;
export type RunWorkflowResponse = SdkRunWorkflowResponse;

/** Extracted workflow item type from the list response. */
export type Workflow = NonNullable<ListWorkflowsResponse["workflows"]>[number];

/** List all workflows for the active organisation. */
export async function listWorkflows(): Promise<ListWorkflowsResponse> {
  return apiClient("/v1/workflows");
}

/** Create a new workflow automation rule. */
export async function createWorkflow(body: CreateWorkflowRequest): Promise<CreateWorkflowResponse> {
  return apiClient("/v1/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Trigger a workflow run, executing its defined actions. */
export async function runWorkflow(workflowId: string, body: RunWorkflowRequest = {}): Promise<RunWorkflowResponse> {
  return apiClient(`/v1/workflows/${workflowId}/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** A pre-built workflow template provided by a plugin. */
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

/** List available workflow templates from installed plugins. */
export async function listWorkflowTemplates(): Promise<ListWorkflowTemplatesResponse> {
  return apiClient("/v1/workflows/templates") as Promise<ListWorkflowTemplatesResponse>;
}


