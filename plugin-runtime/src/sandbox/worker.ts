type Risk = "low" | "medium" | "high";
type Role = "member" | "admin" | "owner";

type ToolCall = {
  id: string;
  title: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: Risk;
};

type ExecutionInput = {
  plugin_key: string;
  handler: string;
  module_code: string;
  method: "simulate" | "execute" | "connector_sync";
  org_id: string;
  user_id: string;
  actor_role: Role;
  tool_call?: ToolCall;
  connector_key?: string;
  connector_options?: Record<string, unknown>;
  request_id?: string;
};

type HostCallRequest = { type: "host_call"; id: string; method: string; params: Record<string, unknown> };
type HostCallResponse =
  | { type: "host_result"; id: string; ok: true; value: unknown }
  | { type: "host_result"; id: string; ok: false; error: string };

type StartMessage = { type: "start"; input: ExecutionInput };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const randomId = () =>
  crypto
    .getRandomValues(new Uint8Array(16))
    .reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");

const loadModule = async (code: string) => {
  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

const callHost = (method: string, params: Record<string, unknown>) => {
  const id = randomId();
  const message: HostCallRequest = { type: "host_call", id, method, params };
  self.postMessage(message);
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
};

const sendResult = (value: unknown) => {
  self.postMessage({ type: "result", ok: true, value });
};

const sendError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  self.postMessage({ type: "result", ok: false, error: message, stack });
};

self.onmessage = async (event: MessageEvent<StartMessage | HostCallResponse>) => {
  const data: any = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "host_result") {
    const row = pending.get(String(data.id || ""));
    if (!row) return;
    pending.delete(String(data.id || ""));
    if (data.ok) {
      row.resolve(data.value);
    } else {
      row.reject(new Error(String(data.error || "host_call_failed")));
    }
    return;
  }

  if (data.type !== "start") return;

  const input = data.input as ExecutionInput;

  try {
    const mod = await loadModule(input.module_code);
    const handlers = (mod && (mod.handlers || mod.default?.handlers)) as Record<string, unknown> | undefined;
    if (!handlers || !isPlainObject(handlers)) {
      throw new Error("Plugin module must export 'handlers' object");
    }

    const handlerRaw = handlers[input.handler];
    if (!handlerRaw || !isPlainObject(handlerRaw)) {
      throw new Error(`Handler not found: ${input.handler}`);
    }

    const fn = handlerRaw[input.method];
    if (typeof fn !== "function") {
      throw new Error(`Handler method not found: ${input.handler}.${input.method}`);
    }

    const ctx = {
      plugin_key: input.plugin_key,
      org_id: input.org_id,
      user_id: input.user_id,
      actor_role: input.actor_role,
      tool_call: input.tool_call,
      connector_key: input.connector_key,
      connector_options: input.connector_options,
      request_id: input.request_id,
      now_iso: new Date().toISOString(),
      host: {
        call: (method: string, params: Record<string, unknown> = {}) => callHost(method, params),
      },
    };

    const out = await fn(ctx);
    if (!isPlainObject(out)) {
      throw new Error("Handler must return an object");
    }
    sendResult(out);
  } catch (error) {
    sendError(error);
  }
};

