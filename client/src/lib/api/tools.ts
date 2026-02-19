import type { ToolCall } from "@/types/ai.types";

import { apiClient } from "./core";

export type ToolSimulateResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  requires_confirmation: boolean;
  risk: string;
  preview: Record<string, unknown>;
  request_id?: string;
};

export async function simulateToolCall(toolCall: ToolCall): Promise<ToolSimulateResponse> {
  return apiClient("/tools/simulate", {
    method: "POST",
    body: JSON.stringify({ tool_call: toolCall }),
  });
}

export type ToolExecuteResponse = {
  ok: true;
  tool_execution_id: string;
  tool_call_id: string;
  tool: string;
  idempotency_key: string;
  idempotent_replay: boolean;
  result: Record<string, unknown>;
  request_id?: string;
};

export async function executeToolCall(
  toolCall: ToolCall,
  options: { confirm?: boolean; idempotency_key?: string } = {}
): Promise<ToolExecuteResponse> {
  const body: any = { tool_call: toolCall };
  if (options.confirm !== undefined) {
    body.confirm = options.confirm;
  }
  if (options.idempotency_key) {
    body.idempotency_key = options.idempotency_key;
  }

  return apiClient("/tools/execute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

