import { getConfig } from "./config.ts";
import { json, readJson, getBearerToken } from "./http.ts";
import { createLogger } from "./log.ts";
import { inc, renderPrometheus } from "./metrics.ts";
import { loadPlugins, type LoadedPlugin } from "./plugins/loader.ts";
import type { PluginToolDefinition, PluginConnectorDefinition } from "./plugins/manifest.ts";
import { runInSandbox } from "./sandbox/runner.ts";
import { hostCall } from "./host/api.ts";
import type { ToolCallInput, Role } from "./types.ts";
import { validateJsonSchema } from "./validation/jsonSchema.ts";

const cfg = getConfig();
const logger = createLogger(cfg.logLevel);

type RegistryTool = PluginToolDefinition & {
  plugin_key: string;
  version: string;
  publisher: string;
  permissions: string[];
};

type RegistryConnector = PluginConnectorDefinition & {
  plugin_key: string;
  version: string;
  publisher: string;
  permissions: string[];
};

type RegistrySnapshot = {
  loaded_at: string;
  plugins: Array<{
    plugin_key: string;
    version: string;
    publisher: string;
    permissions: string[];
    tools: PluginToolDefinition[];
    connectors: PluginConnectorDefinition[];
  }>;
  tools: RegistryTool[];
  connectors: RegistryConnector[];
};

let loadedPlugins: LoadedPlugin[] = [];
let snapshot: RegistrySnapshot = { loaded_at: new Date().toISOString(), plugins: [], tools: [], connectors: [] };

const rebuildSnapshot = () => {
  const tools: RegistryTool[] = [];
  const connectors: RegistryConnector[] = [];

  const plugins = loadedPlugins.map((p) => {
    for (const tool of p.manifest.tools) {
      tools.push({
        ...tool,
        plugin_key: p.manifest.plugin_key,
        version: p.manifest.version,
        publisher: p.manifest.publisher,
        permissions: p.manifest.permissions,
      });
    }

    for (const connector of p.manifest.connectors) {
      connectors.push({
        ...connector,
        plugin_key: p.manifest.plugin_key,
        version: p.manifest.version,
        publisher: p.manifest.publisher,
        permissions: p.manifest.permissions,
      });
    }

    return {
      plugin_key: p.manifest.plugin_key,
      version: p.manifest.version,
      publisher: p.manifest.publisher,
      permissions: p.manifest.permissions,
      tools: p.manifest.tools,
      connectors: p.manifest.connectors,
    };
  });

  snapshot = {
    loaded_at: new Date().toISOString(),
    plugins,
    tools,
    connectors,
  };
};

const refreshPlugins = async () => {
  const startedAt = Date.now();
  const plugins = await loadPlugins(cfg.pluginDir);
  loadedPlugins = plugins;
  rebuildSnapshot();
  logger.info("plugins_loaded", {
    count: loadedPlugins.length,
    ms: Date.now() - startedAt,
    plugin_dir: cfg.pluginDir,
  });
};

await refreshPlugins();

const requireAuth = (req: Request) => {
  if (!cfg.authToken) return true;
  const token = getBearerToken(req);
  return token && token === cfg.authToken;
};

const findTool = (tool: string): { plugin: LoadedPlugin; def: PluginToolDefinition } | null => {
  for (const plugin of loadedPlugins) {
    const def = plugin.manifest.tools.find((t) => t.tool === tool);
    if (def) return { plugin, def };
  }
  return null;
};

const findConnector = (connectorKey: string): { plugin: LoadedPlugin; def: PluginConnectorDefinition } | null => {
  const needle = connectorKey.trim().toLowerCase();
  for (const plugin of loadedPlugins) {
    const def = plugin.manifest.connectors.find((c) => c.connector_key === needle);
    if (def) return { plugin, def };
  }
  return null;
};

const parseRole = (value: unknown): Role => {
  const normalized = String(value || "member").toLowerCase();
  if (normalized === "admin" || normalized === "owner") return normalized;
  return "member";
};

const parseToolCall = (value: unknown): ToolCallInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("tool_call must be an object");
  }
  const raw: any = value;
  const args =
    raw.args && typeof raw.args === "object" && !Array.isArray(raw.args)
      ? (raw.args as Record<string, unknown>)
      : {};
  return {
    id: String(raw.id || ""),
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    tool: String(raw.tool || ""),
    args,
    requires_confirmation: Boolean(raw.requires_confirmation),
    risk: (["low", "medium", "high"].includes(String(raw.risk)) ? raw.risk : "low") as any,
  };
};

const handler = async (req: Request): Promise<Response> => {
  inc("http_requests_total", 1);

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    if (path === "/health" && req.method === "GET") {
      return json(200, {
        ok: true,
        service: "plugin-runtime",
        loaded_at: snapshot.loaded_at,
        plugins: snapshot.plugins.map((p) => p.plugin_key),
      });
    }

    if (path === "/metrics" && req.method === "GET") {
      return new Response(renderPrometheus(), {
        status: 200,
        headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }

    if (path === "/v1/registry" && req.method === "GET") {
      if (!requireAuth(req)) return json(403, { ok: false, code: "FORBIDDEN" });
      return json(200, { ok: true, ...snapshot });
    }

    if (path === "/v1/reload" && req.method === "POST") {
      if (!requireAuth(req)) return json(403, { ok: false, code: "FORBIDDEN" });
      await refreshPlugins();
      return json(200, { ok: true, loaded_at: snapshot.loaded_at, plugins: snapshot.plugins.length });
    }

    if (path === "/v1/tools/simulate" && req.method === "POST") {
      if (!requireAuth(req)) return json(403, { ok: false, code: "FORBIDDEN" });
      inc("tool_simulate_total", 1);
      const body = await readJson(req);
      const b: any = body || {};
      const toolCall = parseToolCall(b.tool_call);
      const found = findTool(toolCall.tool);
      if (!found) return json(404, { ok: false, code: "TOOL_NOT_FOUND" });

      const argsValidation = validateJsonSchema(found.def.args_schema, toolCall.args);
      if (!argsValidation.ok) {
        return json(400, { ok: false, code: "ARGS_INVALID", errors: argsValidation.errors.slice(0, 20) });
      }

      const out = await runInSandbox(
        {
          manifest: found.plugin.manifest,
          handler: found.def.handler,
          moduleCode: found.plugin.moduleCode,
          method: "simulate",
          orgId: String(b.org_id || ""),
          userId: String(b.user_id || ""),
          actorRole: parseRole(b.actor_role),
          toolCall,
          requestId: typeof b.request_id === "string" ? b.request_id : undefined,
        },
        {
          timeoutMs: cfg.execTimeoutMs,
          hostCall,
        }
      );

      return json(200, {
        ok: true,
        tool_call_id: toolCall.id,
        tool: toolCall.tool,
        requires_confirmation: Boolean(toolCall.requires_confirmation || found.def.requires_confirmation_default),
        risk: toolCall.risk,
        preview: out,
        request_id: typeof b.request_id === "string" ? b.request_id : undefined,
      });
    }

    if (path === "/v1/tools/execute" && req.method === "POST") {
      if (!requireAuth(req)) return json(403, { ok: false, code: "FORBIDDEN" });
      inc("tool_execute_total", 1);
      const body = await readJson(req);
      const b: any = body || {};
      const toolCall = parseToolCall(b.tool_call);
      const found = findTool(toolCall.tool);
      if (!found) return json(404, { ok: false, code: "TOOL_NOT_FOUND" });

      const argsValidation = validateJsonSchema(found.def.args_schema, toolCall.args);
      if (!argsValidation.ok) {
        return json(400, { ok: false, code: "ARGS_INVALID", errors: argsValidation.errors.slice(0, 20) });
      }

      const out = await runInSandbox(
        {
          manifest: found.plugin.manifest,
          handler: found.def.handler,
          moduleCode: found.plugin.moduleCode,
          method: "execute",
          orgId: String(b.org_id || ""),
          userId: String(b.user_id || ""),
          actorRole: parseRole(b.actor_role),
          toolCall,
          requestId: typeof b.request_id === "string" ? b.request_id : undefined,
        },
        {
          timeoutMs: cfg.execTimeoutMs,
          hostCall,
        }
      );

      return json(200, {
        ok: true,
        tool_call_id: toolCall.id,
        tool: toolCall.tool,
        result: out,
        request_id: typeof b.request_id === "string" ? b.request_id : undefined,
      });
    }

    if (path === "/v1/connectors/sync" && req.method === "POST") {
      if (!requireAuth(req)) return json(403, { ok: false, code: "FORBIDDEN" });
      inc("connector_sync_total", 1);
      const body = await readJson(req);
      const b: any = body || {};
      const connectorKey = String(b.connector_key || "");
      const found = findConnector(connectorKey);
      if (!found) return json(404, { ok: false, code: "CONNECTOR_NOT_FOUND" });

      const out = await runInSandbox(
        {
          manifest: found.plugin.manifest,
          handler: found.def.handler,
          moduleCode: found.plugin.moduleCode,
          method: "connector_sync",
          orgId: String(b.org_id || ""),
          userId: String(b.user_id || ""),
          actorRole: parseRole(b.actor_role),
          connectorKey: found.def.connector_key,
          connectorOptions:
            b.options && typeof b.options === "object" && !Array.isArray(b.options) ? b.options : {},
          requestId: typeof b.request_id === "string" ? b.request_id : undefined,
        },
        {
          timeoutMs: cfg.execTimeoutMs,
          hostCall,
        }
      );

      return json(200, {
        ok: true,
        connector_key: found.def.connector_key,
        result: out,
        request_id: typeof b.request_id === "string" ? b.request_id : undefined,
      });
    }

    return json(404, { ok: false, code: "NOT_FOUND" });
  } catch (error) {
    inc("errors_total", 1);
    logger.warn("request_failed", { path, error: error instanceof Error ? error.message : String(error) });
    return json(500, {
      ok: false,
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

logger.info("listening", { port: cfg.port });
await Deno.serve({ port: cfg.port, hostname: "0.0.0.0" }, handler);
