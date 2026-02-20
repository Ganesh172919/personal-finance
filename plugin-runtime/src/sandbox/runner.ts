import type { PluginManifest } from "../plugins/manifest.ts";

type Role = "member" | "admin" | "owner";
type Risk = "low" | "medium" | "high";

export type ToolCall = {
  id: string;
  title: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: Risk;
};

export type SandboxMethod = "simulate" | "execute" | "connector_sync";

export type SandboxRunInput = {
  manifest: PluginManifest;
  handler: string;
  moduleCode: string;
  method: SandboxMethod;
  orgId: string;
  userId: string;
  actorRole: Role;
  toolCall?: ToolCall;
  connectorKey?: string;
  connectorOptions?: Record<string, unknown>;
  requestId?: string;
};

type HostCallHandler = (params: {
  pluginKey: string;
  permissions: string[];
  method: string;
  params: Record<string, unknown>;
  requestId?: string;
}) => Promise<unknown>;

type WorkerResultMessage =
  | { type: "result"; ok: true; value: Record<string, unknown> }
  | { type: "result"; ok: false; error: string; stack?: string };

type WorkerHostCallMessage = { type: "host_call"; id: string; method: string; params: Record<string, unknown> };

type WorkerHostResultMessage =
  | { type: "host_result"; id: string; ok: true; value: unknown }
  | { type: "host_result"; id: string; ok: false; error: string };

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const runInSandbox = async (input: SandboxRunInput, options: { timeoutMs: number; hostCall: HostCallHandler }) => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    type: "module",
    deno: { namespace: false, permissions: "none" },
  });

  let timeout: number | null = null;
  let settled = false;

  const cleanup = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    try {
      worker.terminate();
    } catch {
      // ignore
    }
  };

  const resultPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
    const resolveOnce = (value: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    worker.onmessage = async (event) => {
      const data: unknown = (event as MessageEvent).data;
      const msg = data as WorkerResultMessage | WorkerHostCallMessage;

      if (msg && typeof msg === "object" && (msg as any).type === "host_call") {
        const call = msg as WorkerHostCallMessage;
        try {
          const value = await options.hostCall({
            pluginKey: input.manifest.plugin_key,
            permissions: input.manifest.permissions,
            method: String(call.method || ""),
            params:
              call.params && typeof call.params === "object" && !Array.isArray(call.params)
                ? (call.params as Record<string, unknown>)
                : {},
            requestId: input.requestId,
          });
          const res: WorkerHostResultMessage = { type: "host_result", id: String(call.id || ""), ok: true, value };
          worker.postMessage(res);
        } catch (error) {
          const res: WorkerHostResultMessage = {
            type: "host_result",
            id: String(call.id || ""),
            ok: false,
            error: asErrorMessage(error).slice(0, 500),
          };
          worker.postMessage(res);
        }
        return;
      }

      if (msg && typeof msg === "object" && (msg as any).type === "result") {
        const res = msg as WorkerResultMessage;
        cleanup();
        if (res.ok) {
          resolveOnce(res.value);
        } else {
          rejectOnce(new Error(res.error || "plugin_execution_failed"));
        }
        return;
      }
    };

    worker.onerror = (event) => {
      cleanup();
      rejectOnce(new Error(event.message || "worker_error"));
    };

    worker.onmessageerror = () => {
      cleanup();
      rejectOnce(new Error("worker_message_error"));
    };

    timeout = setTimeout(() => {
      cleanup();
      rejectOnce(new Error("plugin_timeout"));
    }, options.timeoutMs);
  });

  worker.postMessage({
    type: "start",
    input: {
      plugin_key: input.manifest.plugin_key,
      handler: input.handler,
      module_code: input.moduleCode,
      method: input.method,
      org_id: input.orgId,
      user_id: input.userId,
      actor_role: input.actorRole,
      tool_call: input.toolCall,
      connector_key: input.connectorKey,
      connector_options: input.connectorOptions,
      request_id: input.requestId,
    },
  });

  return await resultPromise;
};
