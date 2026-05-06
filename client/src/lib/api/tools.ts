/**
 * @fileoverview AI Tool Call Simulation & Execution API
 *
 * Provides a two-phase "dry-run then execute" pattern for AI tool calls.
 * When the AI agent proposes a financial action (e.g., create a transaction,
 * update a goal), the client first *simulates* the call to preview its
 * effects and check risk, then optionally *executes* it for real.
 *
 * Key concepts:
 * - **Simulate**: A safe, read-only preview of what a tool call would do.
 *   Returns a risk assessment, a preview of the result, and whether the
 *   tool requires explicit user confirmation before execution.
 * - **Execute**: Actually performs the tool call on the server. Supports
 *   an idempotency key to prevent duplicate side-effects on retries.
 * - **ToolCall**: The AI-generated instruction object that identifies
 *   which tool to invoke and with what parameters.
 *
 * This pattern ensures the user always sees what the AI plans to do
 * before any real financial changes are made.
 */

import type { ToolCall } from "@/types/ai.types";

import { apiClient } from "./core";

/** Response from the tool simulation (dry-run) endpoint. */
export type ToolSimulateResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  requires_confirmation: boolean;
  risk: string;
  preview: Record<string, unknown>;
  request_id?: string;
};

/**
 * Simulate a tool call without side-effects.
 * Returns a risk assessment and preview so the UI can show the user
 * what would happen before they confirm.
 */
export async function simulateToolCall(toolCall: ToolCall): Promise<ToolSimulateResponse> {
  return apiClient("/tools/simulate", {
    method: "POST",
    body: JSON.stringify({ tool_call: toolCall }),
  });
}

/** Response from actually executing a tool call on the server. */
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

/**
 * Execute a tool call on the server, applying real financial side-effects.
 * `confirm` must be true for high-risk tools; `idempotency_key` prevents
 * duplicate effects on retries.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  options: { confirm?: boolean; idempotency_key?: string } = {}
): Promise<ToolExecuteResponse> {
  const body: any = { tool_call: toolCall };
  // Only include optional fields when explicitly provided to avoid
  // sending unnecessary data to the server.
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

