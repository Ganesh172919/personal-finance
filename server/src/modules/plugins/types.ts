import type { UsageFeature } from "../../models/usageEventModel";
import type { ToolCatalogRole } from "../../services/toolCatalog";

// Descriptor type representing an executable tool provided by an external plugin.
// Encapsulates plugin origin, publisher info, declared permissions, and argument schemas.
// Used by plugin execution sandboxes and tool catalogs to dispatch tool runs.
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

// Descriptor type representing a data synchronization connector supplied by a plugin.
// Captures connector metadata, capabilities, category, and sandbox execution handlers.
// Enables dynamic registration of third-party integration connectors at runtime.
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

// Response structure returned by the plugin runtime sandbox registry endpoint.
// Lists all loaded plugins, registered tools, and declared integration connectors.
// Synchronizes runtime capabilities between the Node.js server and Python sandbox.
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

// Outcome structure returned from dry-run simulations of plugin tool invocations.
// Reports calculated risk rating, confirmation requirements, and execution preview diffs.
// Provides preview payload for user confirmation dialogs before real execution.
export type PluginRuntimeSimulateResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  requires_confirmation: boolean;
  risk: "low" | "medium" | "high";
  preview: Record<string, unknown>;
  request_id?: string;
};

// Response structure returned upon successful execution of a plugin tool.
// Returns mutated entity outcome details, tool identifier, and tracking request ID.
// Signals completion to caller and supplies payload for client-side rendering.
export type PluginRuntimeExecuteResponse = {
  ok: true;
  tool_call_id: string;
  tool: string;
  result: Record<string, unknown>;
  request_id?: string;
};

// Response structure returned after running a plugin-managed connector synchronization.
// Conveys the affected connector key, execution results, and correlation request ID.
// Formats synchronization output for storage in connector history records.
export type PluginRuntimeConnectorSyncResponse = {
  ok: true;
  connector_key: string;
  result: Record<string, unknown>;
  request_id?: string;
};

// Re-exported type alias referring to known system features subject to usage metering.
// Maps plugin tool invocations to tracked billable resource consumption categories.
// Ensures plugin billing events match recognized model feature definitions.
export type KnownUsageFeature = UsageFeature;

