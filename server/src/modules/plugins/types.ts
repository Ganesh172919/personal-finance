import type { UsageFeature } from "../../models/usageEventModel";
import type { ToolCatalogRole } from "../../services/toolCatalog";

export type PluginRuntimeTool = {
  plugin_key: string;
  version: string;
  publisher: string;
  permissions: string[];
  tool: string;
  handler: string;
  title: string;
  description: string;
  risk_default: "low" | "medium" | "high";
  requires_confirmation_default: boolean;
  required_role: ToolCatalogRole;
  required_entitlement?: { feature: string; units?: number };
  args_schema: Record<string, unknown>;
  args_example: Record<string, unknown>;
};

export type PluginRuntimeConnector = {
  plugin_key: string;
  version: string;
  publisher: string;
  permissions: string[];
  connector_key: string;
  handler: string;
  name: string;
  category: "banking" | "file_import" | "documents";
  supports_webhook: boolean;
  stub_mode: boolean;
};

export type PluginRuntimeRegistryResponse = {
  ok: true;
  loaded_at: string;
  plugins: Array<{
    plugin_key: string;
    version: string;
    publisher: string;
    permissions: string[];
    tools: Array<Omit<PluginRuntimeTool, "plugin_key" | "version" | "publisher" | "permissions">>;
    connectors: Array<Omit<PluginRuntimeConnector, "plugin_key" | "version" | "publisher" | "permissions">>;
  }>;
  tools: PluginRuntimeTool[];
  connectors: PluginRuntimeConnector[];
};

export type PluginRuntimeSimulateResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  requires_confirmation: boolean;
  risk: "low" | "medium" | "high";
  preview: Record<string, unknown>;
  request_id?: string;
};

export type PluginRuntimeExecuteResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  result: Record<string, unknown>;
  request_id?: string;
};

export type PluginRuntimeConnectorSyncResponse = {
  ok: true;
  connector_key: string;
  result: Record<string, unknown>;
  request_id?: string;
};

export type KnownUsageFeature = UsageFeature;

