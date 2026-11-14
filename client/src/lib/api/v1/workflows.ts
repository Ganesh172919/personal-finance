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

// Defines input parameters for configuring a new automated workflow rule.
// Captures trigger event criteria, conditional filters, and sequential actions.
// Submits automation specifications to initialize workflow orchestrations.
export type CreateWorkflowRequest = SdkCreateWorkflowRequest;

// Encapsulates the response produced following workflow automation creation.
// Returns the newly provisioned workflow record with active execution status.
// Updates local automation rule lists and enables trigger event monitoring.
export type CreateWorkflowResponse = SdkCreateWorkflowResponse;

// Encapsulates the response payload containing all organization workflow definitions.
// Delivers the array of configured automations alongside server tracking metadata.
// Powers automation dashboard tables displaying active triggers and action chains.
export type ListWorkflowsResponse = SdkListWorkflowsResponse;

// Defines manual execution trigger options for an existing automation workflow.
// Passes optional context overrides and manual execution parameters.
// Allows on-demand workflow testing and manual pipeline invocations.
export type RunWorkflowRequest = SdkRunWorkflowRequest;

// Encapsulates the execution result payload returned after triggering a workflow.
// Reports execution status, action step completion outcomes, and error details.
// Confirms whether all sequential actions completed successfully or encountered faults.
export type RunWorkflowResponse = SdkRunWorkflowResponse;

// Represents an individual user-defined workflow entity extracted from list responses.
// Encapsulates automation triggers, filter rules, scheduled intervals, and actions.
// Serves as the primary data model driving visual workflow builder interfaces.
/** Extracted workflow item type from the list response. */
export type Workflow = NonNullable<ListWorkflowsResponse["workflows"]>[number];

// Queries all automation workflows configured for the active organization.
// Dispatches an authenticated GET request loading custom automation definitions.
// Populates workflow management dashboards and status monitoring panels.
/** List all workflows for the active organisation. */
export async function listWorkflows(): Promise<ListWorkflowsResponse> {
  return apiClient("/workflows");
}

// Registers a new automated financial workflow with specified triggers and actions.
// Dispatches an authenticated POST request transmitting the workflow configuration.
// Activates event listeners to monitor platform events matching rule criteria.
/** Create a new workflow automation rule. */
export async function createWorkflow(body: CreateWorkflowRequest): Promise<CreateWorkflowResponse> {
  return apiClient("/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Manually triggers an immediate execution run of an existing automation workflow.
// Dispatches an authenticated POST request targeting the workflow execution endpoint.
// Returns execution metrics and step-by-step progress reports for live auditing.
/** Trigger a workflow run, executing its defined actions. */
export async function runWorkflow(workflowId: string, body: RunWorkflowRequest = {}): Promise<RunWorkflowResponse> {
  return apiClient(`/workflows/${workflowId}/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Represents a pre-packaged automation recipe provided by a plugin extension.
// Delivers ready-to-use trigger and action configurations for common financial tasks.
// Accelerates workflow creation by providing customizable pre-built templates.
/** A pre-built workflow template provided by a plugin. */
export type WorkflowTemplate = {
  template_key: string;
  plugin_key: string;
  plugin_version: string | null;
  name: string;
  description: string;
  request: CreateWorkflowRequest;
};

// Encapsulates the collection of available pre-built workflow templates.
// Delivers template catalogs bundled across installed marketplace plugin packages.
// Drives template selection galleries and quick-start automation wizards.
export type ListWorkflowTemplatesResponse = {
  org_id: string;
  templates: WorkflowTemplate[];
  request_id: string;
};

// Retrieves all pre-built workflow templates provided by active plugins.
// Dispatches an authenticated GET request loading template metadata and presets.
// Supplies inspiration and boilerplate configurations for common automation tasks.
/** List available workflow templates from installed plugins. */
export async function listWorkflowTemplates(): Promise<ListWorkflowTemplatesResponse> {
  return apiClient("/workflows/templates") as Promise<ListWorkflowTemplatesResponse>;
}


