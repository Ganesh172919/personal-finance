import type { ToolCall } from "@/types/ai.types";
import type { CreateWorkflowRequest, Workflow } from "@/lib/apiClient";

import type { WorkflowAction } from "@/types/apiTypes";

// Generates a unique tracking identifier for newly constructed tool calls.
// Employs native cryptographic UUID generation with a timestamped fallback.
// Guarantees unique correlation keys across client-side automation actions.
const newToolCallId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `tc_${Math.random().toString(36).slice(2)}_${Date.now()}`.slice(0, 128);
  }
};

// Synthesizes an interactive AI tool call descriptor for workflow creation.
// Packages the workflow request payload into arguments requiring user confirmation.
// Permits previewing and approving workflow instantiation directly from chat.
export const toolCallForWorkflowCreate = (request: CreateWorkflowRequest): ToolCall => ({
  id: newToolCallId(),
  title: `Create workflow: ${request.name}`.slice(0, 160),
  description: "Create an automation workflow for your organization.",
  tool: "workflows.create",
  args: request as unknown as Record<string, unknown>,
  requires_confirmation: true,
  risk: "low",
});

// Constructs a tool call object for enabling or disabling an active workflow.
// Encapsulates the target workflow ID and next boolean activation status.
// Enforces explicit user confirmation before applying tenant-wide state shifts.
export const toolCallForWorkflowEnable = (workflow: Workflow, nextEnabled: boolean): ToolCall => ({
  id: newToolCallId(),
  title: `${nextEnabled ? "Enable" : "Disable"} workflow: ${workflow.name}`.slice(0, 160),
  description: "Toggle a workflow on/off.",
  tool: "workflows.enable",
  args: { workflow_id: workflow.id, enabled: nextEnabled },
  requires_confirmation: true,
  risk: "low",
});

// Builds a tool call specification requesting immediate manual workflow execution.
// Targets the designated workflow ID without waiting for scheduled triggers.
// Allows operators to verify workflow behaviors on demand through chat cards.
export const toolCallForWorkflowRun = (workflow: Workflow): ToolCall => ({
  id: newToolCallId(),
  title: `Run workflow: ${workflow.name}`.slice(0, 160),
  description: "Run a workflow immediately.",
  tool: "workflows.run",
  args: { workflow_id: workflow.id },
  requires_confirmation: true,
  risk: "low",
});

// Derives a descriptive display badge label for an individual workflow action.
// Inspects action types across tasks, notifications, delays, and exports.
// Appends human-readable condition summaries when conditional gates are present.
export const workflowActionLabel = (action: WorkflowAction) => {
  let label = "Action";
  if (action.type === "create_task") label = `Task: ${(action as any).title || "create_task"}`;
  else if (action.type === "send_notification") label = `Notify: ${(action as any).subject || "send_notification"}`;
  else if (action.type === "export_report") label = `Export: ${(action as any).export_type || "export_report"}`;
  else if (action.type === "delay") {
    const s = Number((action as any).duration_seconds) || 60;
    const mins = Math.round(s / 60);
    label = `Delay: ${mins > 0 ? `${mins}m (${s}s)` : `${s}s`}${
      (action as any).description ? ` - ${(action as any).description}` : ""
    }`;
  }

  if ((action as any).condition?.field) {
    label += ` [if ${(action as any).condition.field} ${(action as any).condition.operator} ${(action as any).condition.value}]`;
  }
  return label;
};



