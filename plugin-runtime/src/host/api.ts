import { getConfig } from "../config.ts";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toolPrefixPermission: Array<{ prefix: string; permission: string }> = [
  { prefix: "transactions.", permission: "transactions:write" },
  { prefix: "goals.", permission: "goals:write" },
  { prefix: "debts.", permission: "debts:write" },
  { prefix: "workflows.", permission: "workflows:write" },
  { prefix: "exports.", permission: "exports:write" },
  { prefix: "notifications.", permission: "notifications:write" },
  { prefix: "finance.", permission: "transactions:read" },
  { prefix: "budgets.", permission: "budgets:write" },
  { prefix: "closeMonth.", permission: "exports:write" },
];

const isToolAllowed = (tool: string, permissions: string[]) => {
  const normalizedTool = String(tool || "").trim();
  const match = toolPrefixPermission.find((row) => normalizedTool.startsWith(row.prefix));
  if (!match) return false;
  return permissions.includes(match.permission);
};

const requestJson = async (params: {
  url: string;
  token: string;
  payload: unknown;
  requestId?: string;
  timeoutMs: number;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.token}`,
        ...(params.requestId ? { "x-request-id": params.requestId } : {}),
      },
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Host request failed (${res.status}): ${text.slice(0, 400)}`);
    }
    return text ? (JSON.parse(text) as unknown) : {};
  } finally {
    clearTimeout(timeout);
  }
};

export const hostCall = async (params: {
  pluginKey: string;
  permissions: string[];
  method: string;
  params: Record<string, unknown>;
  requestId?: string;
}) => {
  const cfg = getConfig();

  const method = String(params.method || "").trim();
  if (method === "tool.simulate" || method === "tool.execute") {
    if (!cfg.finwiseServerUrl || !cfg.finwiseToolsToken) {
      throw new Error("FINWISE_SERVER_URL / FINWISE_TOOLS_TOKEN not configured in plugin runtime");
    }

    const orgId = String(params.params.org_id || "");
    const userId = String(params.params.user_id || "");
    const toolCall = params.params.tool_call;
    if (!orgId || !userId) {
      throw new Error("Missing org_id or user_id");
    }
    if (!isPlainObject(toolCall)) {
      throw new Error("tool_call must be an object");
    }
    const toolName = String((toolCall as any).tool || "");
    if (!isToolAllowed(toolName, params.permissions)) {
      throw new Error("Plugin does not have permission to call this tool");
    }

    const endpoint = method === "tool.simulate" ? "/api/internal/tools/simulate" : "/api/internal/tools/execute";
    const url = `${cfg.finwiseServerUrl}${endpoint}`;
    const payload = {
      org_id: orgId,
      user_id: userId,
      tool_call: toolCall,
      ...(method === "tool.execute"
        ? {
            confirm: Boolean((params.params as any).confirm ?? true),
            idempotency_key:
              typeof (params.params as any).idempotency_key === "string"
                ? (params.params as any).idempotency_key
                : undefined,
          }
        : {}),
    };

    return await requestJson({
      url,
      token: cfg.finwiseToolsToken,
      payload,
      requestId: params.requestId,
      timeoutMs: cfg.requestTimeoutMs,
    });
  }

  throw new Error("Unsupported host API method");
};

