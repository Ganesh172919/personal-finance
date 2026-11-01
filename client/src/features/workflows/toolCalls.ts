import type { ToolCall } from "@/types/ai.types";
import type { CreateWorkflowRequest, Workflow } from "@/lib/apiClient";

import type { WorkflowAction } from "@/types/apiTypes";

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
  let label = "Action";
  if (action.type === "create_task") label = `Task: ${(action as any).title || "create_task"}`;
  else if (action.type === "send_notification") label = `Notify: ${(action as any).subject || "send_notification"}`;
  else if (action.type === "export_report") label = `Export: ${(action as any).export_type || "export_report"}`;

  if ((action as any).condition?.field) {
    label += ` [if ${(action as any).condition.field} ${(action as any).condition.operator} ${(action as any).condition.value}]`;
  }
  return label;
};



