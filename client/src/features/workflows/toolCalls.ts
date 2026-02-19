import type { ToolCall } from "@/types/ai.types";
import type { CreateWorkflowRequest, Workflow } from "@/lib/apiClient";

import type { WorkflowAction } from "@finwise/sdk-ts";

const newToolCallId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `tc_${Math.random().toString(36).slice(2)}_${Date.now()}`.slice(0, 128);
  }
};

export const toolCallForWorkflowCreate = (request: CreateWorkflowRequest): ToolCall => ({
  id: newToolCallId(),
  title: `Create workflow: ${request.name}`.slice(0, 160),
  description: "Create an automation workflow for your organization.",
  tool: "workflows.create",
  args: request as unknown as Record<string, unknown>,
  requires_confirmation: true,
  risk: "low",
});

export const toolCallForWorkflowEnable = (workflow: Workflow, nextEnabled: boolean): ToolCall => ({
  id: newToolCallId(),
  title: `${nextEnabled ? "Enable" : "Disable"} workflow: ${workflow.name}`.slice(0, 160),
  description: "Toggle a workflow on/off.",
  tool: "workflows.enable",
  args: { workflow_id: workflow.id, enabled: nextEnabled },
  requires_confirmation: true,
  risk: "low",
});

export const toolCallForWorkflowRun = (workflow: Workflow): ToolCall => ({
  id: newToolCallId(),
  title: `Run workflow: ${workflow.name}`.slice(0, 160),
  description: "Run a workflow immediately.",
  tool: "workflows.run",
  args: { workflow_id: workflow.id },
  requires_confirmation: true,
  risk: "low",
});

export const workflowActionLabel = (action: WorkflowAction) => {
  if (action.type === "create_task") return `Task: ${(action as any).title || "create_task"}`;
  if (action.type === "send_notification") return `Notify: ${(action as any).subject || "send_notification"}`;
  if (action.type === "export_report") return `Export: ${(action as any).export_type || "export_report"}`;
  return "Action";
};

