import mongoose from "mongoose";

import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import type { ToolHandler } from "../../services/tools/types";
import type { ToolCatalogEntry } from "../../services/toolCatalog";
import { upsertTool, unregisterTool } from "../../services/tools/registry";
import { upsertConnector, unregisterConnector } from "../../connectors/registry";
import type { IntegrationConnector } from "../../connectors/types";
import { HttpError } from "../../middleware/httpError";
import PluginInstallModel from "../../models/pluginInstallModel";
import { USAGE_FEATURES, type UsageFeature } from "../../models/usageEventModel";
import { executePluginTool, fetchPluginRuntimeRegistry, simulatePluginTool, syncPluginConnector } from "./runtimeClient";
import type { PluginRuntimeConnector, PluginRuntimeTool } from "./types";

const asToolRole = (value: string): ToolCatalogEntry["required_role"] => {
  const normalized = String(value || "member").toLowerCase();
  if (normalized === "admin" || normalized === "owner") return normalized;
  return "member";
};

const isUsageFeature = (value: string): value is UsageFeature => {
  return (USAGE_FEATURES as readonly string[]).includes(value);
};

const toToolCatalogEntry = (tool: PluginRuntimeTool): ToolCatalogEntry => {
  const requiredEntitlement =
    tool.required_entitlement && isUsageFeature(String(tool.required_entitlement.feature))
      ? {
          feature: String(tool.required_entitlement.feature) as UsageFeature,
          units:
            typeof tool.required_entitlement.units === "number" && Number.isFinite(tool.required_entitlement.units)
              ? Math.max(0, Math.floor(tool.required_entitlement.units))
              : undefined,
        }
      : undefined;

  return {
    tool: tool.tool,
    title: tool.title,
    description: tool.description,
    risk_default: tool.risk_default,
    requires_confirmation_default: Boolean(tool.requires_confirmation_default),
    required_role: asToolRole(tool.required_role),
    required_entitlement: requiredEntitlement,
    args_schema: tool.args_schema || {},
    args_example: tool.args_example || {},
  };
};

const ensurePluginInstalled = async (params: {
  orgId: mongoose.Types.ObjectId;
  pluginKey: string;
  requiredPermissions: string[];
}) => {
  const pluginKey = String(params.pluginKey || "").trim().toLowerCase();
  const install = await PluginInstallModel.findOne({ orgId: params.orgId, pluginKey, status: "installed" })
    .select({ pluginKey: 1, version: 1, status: 1, permissionsGranted: 1 })
    .lean();

  if (!install) {
    throw new HttpError(402, "PLUGIN_NOT_INSTALLED", "Plugin is not installed for this organization", { plugin_key: pluginKey });
  }

  const granted = Array.isArray((install as any).permissionsGranted)
    ? (install as any).permissionsGranted.map((p: unknown) => String(p))
    : [];

  const missing = params.requiredPermissions.filter((p) => !granted.includes(p));
  if (missing.length > 0) {
    throw new HttpError(403, "PLUGIN_PERMISSION_DENIED", "Plugin permissions not granted for this organization", {
      plugin_key: pluginKey,
      missing_permissions: missing.slice(0, 25),
    });
  }

  return install;
};

const toProxyToolHandler = (tool: PluginRuntimeTool): ToolHandler => {
  return {
    tool: tool.tool,
    requiredRole: asToolRole(tool.required_role),
    catalog: toToolCatalogEntry(tool),
    simulate: async (ctx) => {
      await ensurePluginInstalled({
        orgId: ctx.orgId,
        pluginKey: tool.plugin_key,
        requiredPermissions: Array.isArray(tool.permissions) ? tool.permissions : [],
      });

      const sim = await simulatePluginTool({
        orgId: ctx.orgId.toString(),
        userId: ctx.userId.toString(),
        actorRole: ctx.actorRole,
        toolCall: ctx.toolCall,
        requestId: ctx.requestId,
      });

      return sim.preview || {};
    },
    execute: async (ctx) => {
      await ensurePluginInstalled({
        orgId: ctx.orgId,
        pluginKey: tool.plugin_key,
        requiredPermissions: Array.isArray(tool.permissions) ? tool.permissions : [],
      });

      const exec = await executePluginTool({
        orgId: ctx.orgId.toString(),
        userId: ctx.userId.toString(),
        actorRole: ctx.actorRole,
        toolCall: ctx.toolCall,
        requestId: ctx.requestId,
      });

      return exec.result || {};
    },
  };
};

const toProxyConnector = (connector: PluginRuntimeConnector): IntegrationConnector => {
  return {
    key: connector.connector_key,
    catalog: {
      connector_key: connector.connector_key,
      name: connector.name,
      category: connector.category,
      supports_webhook: Boolean(connector.supports_webhook),
      stub_mode: Boolean(connector.stub_mode),
    },
    sync: async (ctx, options) => {
      await ensurePluginInstalled({
        orgId: ctx.orgId,
        pluginKey: connector.plugin_key,
        requiredPermissions: Array.isArray(connector.permissions) ? connector.permissions : [],
      });

      const result = await syncPluginConnector({
        orgId: ctx.orgId.toString(),
        userId: ctx.userId.toString(),
        actorRole: "admin",
        connectorKey: connector.connector_key,
        options: { ...(options || {}) } as Record<string, unknown>,
        requestId: ctx.requestId,
      });

      const recordsSyncedRaw = Number((result.result as any)?.records_synced);
      const records_synced = Number.isFinite(recordsSyncedRaw) ? Math.max(0, Math.floor(recordsSyncedRaw)) : 0;
      const metadata = (result.result as any)?.metadata && typeof (result.result as any)?.metadata === "object" ? (result.result as any).metadata : {};

      return { records_synced, metadata };
    },
  };
};

let lastRegisteredTools = new Set<string>();
let lastRegisteredConnectors = new Set<string>();
let refreshTimer: NodeJS.Timeout | null = null;

export const refreshPluginRuntimeRegistry = async (params: { requestId?: string } = {}) => {
  const env = getEnv();
  if (!env.PLUGIN_RUNTIME_URL) {
    return { ok: true as const, enabled: false as const };
  }

  const registry = await fetchPluginRuntimeRegistry({ requestId: params.requestId });
  if (!registry) {
    return { ok: false as const, enabled: true as const, reason: "registry_unavailable" as const };
  }

  const nextTools = new Set<string>();
  const nextConnectors = new Set<string>();

  for (const tool of registry.tools || []) {
    if (!tool?.tool) continue;
    nextTools.add(String(tool.tool));
    try {
      upsertTool(toProxyToolHandler(tool as PluginRuntimeTool));
    } catch (error) {
      logger.warn({ error, tool: tool.tool }, "Failed to register plugin tool");
    }
  }

  for (const connector of registry.connectors || []) {
    if (!connector?.connector_key) continue;
    const key = String(connector.connector_key || "").trim().toLowerCase();
    if (!key) continue;
    nextConnectors.add(key);
    try {
      upsertConnector(toProxyConnector(connector as PluginRuntimeConnector));
    } catch (error) {
      logger.warn({ error, connector_key: key }, "Failed to register plugin connector");
    }
  }

  for (const tool of lastRegisteredTools) {
    if (!nextTools.has(tool)) {
      unregisterTool(tool);
    }
  }
  for (const key of lastRegisteredConnectors) {
    if (!nextConnectors.has(key)) {
      unregisterConnector(key);
    }
  }

  lastRegisteredTools = nextTools;
  lastRegisteredConnectors = nextConnectors;

  return { ok: true as const, enabled: true as const, tools: nextTools.size, connectors: nextConnectors.size };
};

export const startPluginManager = () => {
  const env = getEnv();
  if (!env.PLUGIN_RUNTIME_URL) {
    return { started: false as const, stop: () => {} };
  }

  const refresh = () => {
    void refreshPluginRuntimeRegistry().catch((error) => {
      logger.warn({ error }, "Plugin runtime refresh failed");
    });
  };

  refresh();
  refreshTimer = setInterval(refresh, 30_000);
  refreshTimer.unref();

  logger.info(
    {
      event: "plugin_manager_started",
      plugin_runtime_url: env.PLUGIN_RUNTIME_URL,
    },
    "Plugin manager started"
  );

  return {
    started: true as const,
    stop: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
  };
};
