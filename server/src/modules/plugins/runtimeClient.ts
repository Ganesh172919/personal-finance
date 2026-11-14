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

// Lazily initializes and reuses a singleton Axios client for plugin runtime RPC.
// Monitors changes to PLUGIN_RUNTIME_URL, auth token, and timeout configuration.
// Recreates the client instance if target endpoint or credentials change.
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

// Type guard validating whether a value represents a non-null, non-array plain object.
// Casts valid record structures to a generic key-value dictionary type.
// Returns null when passed primitive values, arrays, or nullish variables.
const asPlainObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// Queries external Python plugin runtime sandbox for registered tools and connectors.
// Passes distributed tracing request ID and validates API response structure.
// Returns registry response or null if runtime is unreachable or unconfigured.
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

// Dispatches dry-run simulation of a plugin tool call to the plugin sandbox.
// Passes organization context, actor role, tool call parameters, and request ID.
// Yields risk assessment, required confirmation status, and diff previews.
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

// Transmits live execution command for a plugin tool to the Python runtime daemon.
// Propagates tenant organization context, caller permissions, and tracing headers.
// Returns execution results or throws if plugin runtime responds with errors.
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

// Dispatches data sync command for a plugin-managed financial connector.
// Forwards connector key, sync options, authentication IDs, and request headers.
// Returns processed record counts and sync result metadata from sandbox.
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

