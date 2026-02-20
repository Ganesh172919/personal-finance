import axios, { type AxiosInstance } from "axios";

import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import type { ToolCallInput } from "../../schemas/v1/toolSchemas";
import type { ToolActorRole } from "../../services/tools/types";
import type {
  PluginRuntimeConnectorSyncResponse,
  PluginRuntimeExecuteResponse,
  PluginRuntimeRegistryResponse,
  PluginRuntimeSimulateResponse,
} from "./types";

let http: AxiosInstance | null = null;
let httpBaseUrl = "";
let httpToken = "";
let httpTimeoutMs = 0;

const getHttp = () => {
  const env = getEnv();
  const baseUrl = env.PLUGIN_RUNTIME_URL || "";
  const token = env.PLUGIN_RUNTIME_TOKEN || "";
  const timeoutMs = env.PLUGIN_RUNTIME_TIMEOUT_MS;

  if (!baseUrl) {
    return null;
  }

  if (!http || httpBaseUrl !== baseUrl || httpToken !== token) {
    httpBaseUrl = baseUrl;
    httpToken = token;
    httpTimeoutMs = timeoutMs;
    http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return http;
  }

  if (httpTimeoutMs !== timeoutMs) {
    httpTimeoutMs = timeoutMs;
    http.defaults.timeout = timeoutMs;
  }

  return http;
};

const asPlainObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const fetchPluginRuntimeRegistry = async (params: { requestId?: string }): Promise<PluginRuntimeRegistryResponse | null> => {
  const http = getHttp();
  if (!http) {
    return null;
  }

  try {
    const { data } = await http.get("/v1/registry", {
      headers: params.requestId ? { "X-Request-Id": params.requestId } : undefined,
    });
    const obj = asPlainObject(data);
    if (!obj || obj.ok !== true) {
      return null;
    }
    return obj as unknown as PluginRuntimeRegistryResponse;
  } catch (error) {
    logger.warn({ error }, "plugin runtime registry fetch failed");
    return null;
  }
};

export const simulatePluginTool = async (params: {
  orgId: string;
  userId: string;
  actorRole: ToolActorRole;
  toolCall: ToolCallInput;
  requestId?: string;
}): Promise<PluginRuntimeSimulateResponse> => {
  const http = getHttp();
  if (!http) {
    throw new Error("PLUGIN_RUNTIME_URL not configured");
  }

  const { data } = await http.post(
    "/v1/tools/simulate",
    {
      org_id: params.orgId,
      user_id: params.userId,
      actor_role: params.actorRole,
      tool_call: params.toolCall,
      request_id: params.requestId,
    },
    {
      headers: params.requestId ? { "X-Request-Id": params.requestId } : undefined,
    }
  );

  return data as PluginRuntimeSimulateResponse;
};

export const executePluginTool = async (params: {
  orgId: string;
  userId: string;
  actorRole: ToolActorRole;
  toolCall: ToolCallInput;
  requestId?: string;
}): Promise<PluginRuntimeExecuteResponse> => {
  const http = getHttp();
  if (!http) {
    throw new Error("PLUGIN_RUNTIME_URL not configured");
  }

  const { data } = await http.post(
    "/v1/tools/execute",
    {
      org_id: params.orgId,
      user_id: params.userId,
      actor_role: params.actorRole,
      tool_call: params.toolCall,
      request_id: params.requestId,
    },
    {
      headers: params.requestId ? { "X-Request-Id": params.requestId } : undefined,
    }
  );

  return data as PluginRuntimeExecuteResponse;
};

export const syncPluginConnector = async (params: {
  orgId: string;
  userId: string;
  actorRole: ToolActorRole;
  connectorKey: string;
  options?: Record<string, unknown>;
  requestId?: string;
}): Promise<PluginRuntimeConnectorSyncResponse> => {
  const http = getHttp();
  if (!http) {
    throw new Error("PLUGIN_RUNTIME_URL not configured");
  }

  const { data } = await http.post(
    "/v1/connectors/sync",
    {
      org_id: params.orgId,
      user_id: params.userId,
      actor_role: params.actorRole,
      connector_key: params.connectorKey,
      options: params.options || {},
      request_id: params.requestId,
    },
    {
      headers: params.requestId ? { "X-Request-Id": params.requestId } : undefined,
    }
  );

  return data as PluginRuntimeConnectorSyncResponse;
};

