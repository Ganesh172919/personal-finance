/**
 * @fileoverview V1 Platform Management API
 *
 * A broad module covering several platform-level subsystems:
 *
 * 1. **Marketplace** -- Browse the plugin catalog and install/update/uninstall
 *    plugins that extend the platform's capabilities.
 * 2. **Integrations** -- Manage third-party data connectors (banks, services),
 *    trigger syncs, and view sync history.
 * 3. **CSV Import** -- Upload transaction CSVs with a column mapping; supports
 *    dry-run mode with per-row validation, duplicate detection, and merchant
 *    matching.
 * 4. **Automation Events** -- Emit and list automation events that can trigger
 *    workflow executions or other platform reactions.
 * 5. **Feature Flags** -- List, upsert, and delete feature flags for gradual
 *    rollouts and A/B testing.
 * 6. **Analytics Overview** -- A high-level analytics summary endpoint
 *    (distinct from the dedicated analytics module's granular endpoints).
 *
 * All functions delegate to the shared `apiClient` for consistent
 * authentication, error handling, and organisation context.
 */

import { apiClient } from "../core";

import type {
  AnalyticsOverviewResponse,
  AutomationEventEmitRequest,
  AutomationEventEmitResponse,
  AutomationEventsCatalogResponse,
  FeatureFlagDeleteResponse,
  FeatureFlagsListResponse,
  FeatureFlagUpsertRequest,
  FeatureFlagUpsertResponse,
  IntegrationHistoryResponse,
  IntegrationsListResponse,
  IntegrationSyncRequest,
  IntegrationSyncResponse,
  MarketplaceCatalogResponse,
  MarketplaceInstallRequest,
  MarketplaceInstallResponse,
  PluginOperationResponse,
  PluginsListResponse,
} from "@/types/apiTypes";

/** ─── Marketplace ──────────────────────────────────────────────── */

// Queries available plugin extensions listed within the public marketplace catalog.
// Formulates URL query parameters for free-text search terms and release stages.
// Dispatches an authenticated GET request loading discoverable extensions.
/** Browse the marketplace plugin catalog with optional search and status filter. */
export async function listMarketplaceCatalog(params?: { q?: string; status?: "active" | "preview" | "deprecated" }) {
  const search = new URLSearchParams();
  if (params?.q) {
    search.set("q", params.q);
  }
  if (params?.status) {
    search.set("status", params.status);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/marketplace/catalog${suffix}`) as Promise<MarketplaceCatalogResponse>;
}

// Installs a designated marketplace plugin into the active organization tenant.
// Dispatches an authenticated POST request delivering plugin keys and configurations.
// Enables new connector integrations and custom tools within the workspace.
/** Install a plugin from the marketplace. */
export async function installMarketplacePlugin(body: MarketplaceInstallRequest) {
  return apiClient("/marketplace/install", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<MarketplaceInstallResponse>;
}

// Retrieves all plugins and extensions currently activated within the organization.
// Dispatches an authenticated GET request fetching plugin manifests and active states.
// Powers organization plugin management views and enabled integration inventories.
/** List all plugins currently installed in the organisation. */
export async function listInstalledPlugins() {
  return apiClient("/plugins") as Promise<PluginsListResponse>;
}

// Upgrades or rolls back an installed organization plugin to a designated target version.
// Dispatches an authenticated POST request targeting the plugin version upgrade endpoint.
// Migrates plugin schema configurations and updates active extension runtimes.
/** Update an installed plugin to a specific version. */
export async function updateInstalledPluginVersion(pluginKey: string, version: string) {
  return apiClient(`/plugins/${encodeURIComponent(pluginKey)}/update`, {
    method: "POST",
    body: JSON.stringify({ version }),
  }) as Promise<PluginOperationResponse>;
}

// Uninstalls a previously activated plugin extension from the active organization.
// Dispatches an authenticated POST request to remove the plugin registration.
// Cleans up background listeners, scheduled jobs, and integration endpoints.
/** Uninstall a plugin from the organisation. */
export async function uninstallInstalledPlugin(pluginKey: string) {
  return apiClient(`/plugins/${encodeURIComponent(pluginKey)}/uninstall`, {
    method: "POST",
  }) as Promise<PluginOperationResponse>;
}

/** ─── Integrations ─────────────────────────────────────────────── */

// Queries all active third-party financial data connectors connected to the tenant.
// Dispatches an authenticated GET request loading configured integration records.
// Displays connection status, institution branding, and recent sync timestamps.
/** List all third-party integrations (connectors) for the organisation. */
export async function listIntegrations() {
  return apiClient("/integrations") as Promise<IntegrationsListResponse>;
}

// Initiates an on-demand data synchronization cycle for an integration connector.
// Dispatches an authenticated POST request triggering backend sync pipelines.
// Returns execution identifiers and initial progress states for polling.
/** Trigger a sync for a specific integration connector. */
export async function syncIntegration(connectorKey: string, body: IntegrationSyncRequest = {}) {
  return apiClient(`/integrations/${encodeURIComponent(connectorKey)}/sync`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<IntegrationSyncResponse>;
}

// Retrieves historical synchronization audit records for a specified data connector.
// Formulates query parameters for maximum log limits and chronological pagination.
// Dispatches an authenticated GET request loading sync audit history trails.
/** Fetch recent sync history for a specific integration connector. */
export async function getIntegrationHistory(connectorKey: string, limit?: number) {
  const query = typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return apiClient(`/integrations/${encodeURIComponent(connectorKey)}/history${query}`) as Promise<IntegrationHistoryResponse>;
}

/** ─── CSV Import ───────────────────────────────────────────────── */

// Defines the column mapping schema associating CSV file headers with ledger fields.
// Maps raw spreadsheet column titles to amounts, dates, descriptions, and categories.
// Reusable across repeated file uploads from the same financial institution format.
/** Column mapping from CSV headers to transaction fields. */
export type TransactionsCsvImportMapping = {
  amount: string;
  date: string;
  description?: string;
  category?: string;
  type?: string;
  merchant?: string;
};

// Encapsulates the complete response payload returned after processing a CSV import.
// Reports parsed counts, identified duplicates, validation errors, and row previews.
// Powers the multi-step CSV import verification wizard and preview data tables.
export type TransactionsCsvImportResponse = {
  ok: true;
  org_id: string;
  import_id: string;
  file_name: string;
  parsed_rows: number;
  valid_rows: number;
  invalid_rows?: number;
  inserted: number;
  duplicates: number;
  merchants_touched: number;
  dry_run: boolean;
  columns?: string[];
  preview_rows?: Array<{
    row_index: number;
    status: "ready" | "duplicate" | "invalid";
    amount_raw: string;
    date_raw: string;
    amount?: number;
    date?: string;
    type?: "income" | "expense" | "investment";
    category?: string;
    description?: string;
    merchant_name?: string;
    merchant_match?: { id: string; name: string } | null;
    duplicate_key?: string;
    issues: string[];
    review: {
      needs_attention: boolean;
      flags: Array<"uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate">;
      notes: string[];
      attention_score: number;
    };
    suggestions?: {
      category?: string;
      category_source?: "merchant_default" | "category_rule";
    };
  }>;
  duplicate_groups?: Array<{
    duplicate_key: string;
    row_indexes: number[];
    reason: string;
  }>;
  mapping_used?: TransactionsCsvImportMapping;
  account_id?: string | null;
  request_id: string;
};

// Uploads a transaction CSV file with associated column mappings for ledger ingestion.
// Packages multipart form data with dry-run verification flags and target accounts.
// Dispatches an authenticated POST request returning parsed rows and validation warnings.
/**
 * Import transactions from a CSV file. Supports dry-run mode for previewing
 * parsed rows, duplicate detection, and merchant matching before committing.
 * `remember_mapping` persists the column mapping for future imports.
 */
export async function importTransactionsCsv(params: {
  file: File;
  mapping: TransactionsCsvImportMapping;
  account_id?: string;
  dry_run?: boolean;
  remember_mapping?: boolean;
}): Promise<TransactionsCsvImportResponse> {
  const form = new FormData();
  form.append("file", params.file, params.file.name);
  form.append("mapping", JSON.stringify(params.mapping));
  if (params.account_id) form.append("account_id", params.account_id);
  if (params.dry_run) form.append("dry_run", "true");
  if (params.remember_mapping !== undefined) form.append("remember_mapping", String(params.remember_mapping));

  return apiClient("/integrations/transactions_csv/import", {
    method: "POST",
    body: form,
  }) as Promise<TransactionsCsvImportResponse>;
}

/** ─── Automation Events ────────────────────────────────────────── */

// Retrieves the catalog of supported platform automation event trigger definitions.
// Dispatches an authenticated GET request querying registered automation schemas.
// Supplies trigger condition options when configuring event-driven workflow rules.
/** List the catalog of available automation event types. */
export async function listAutomationEvents() {
  return apiClient("/automation/events") as Promise<AutomationEventsCatalogResponse>;
}

// Publishes a custom automation event into the organization event dispatch bus.
// Dispatches an authenticated POST request transmitting event payloads and sources.
// Triggers responsive financial workflows and automated event listeners.
/** Emit an automation event that may trigger workflows or other reactions. */
export async function emitAutomationEvent(body: AutomationEventEmitRequest) {
  return apiClient("/automation/events/emit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutomationEventEmitResponse>;
}

/** ─── Feature Flags ────────────────────────────────────────────── */

// Queries feature flags configured across the tenant filtered by key prefix or state.
// Formulates URL query parameters for namespace prefixes and boolean toggle states.
// Dispatches an authenticated GET request loading active feature gating rules.
/** List feature flags, optionally filtered by key prefix and enabled state. */
export async function listFeatureFlags(params?: { keyPrefix?: string; enabled?: boolean }) {
  const search = new URLSearchParams();
  if (params?.keyPrefix) {
    search.set("key_prefix", params.keyPrefix);
  }
  if (typeof params?.enabled === "boolean") {
    search.set("enabled", String(params.enabled));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiClient(`/feature-flags${suffix}`) as Promise<FeatureFlagsListResponse>;
}

// Provisions or updates a feature flag toggle controlling access to experimental tools.
// Dispatches an authenticated PUT request transmitting target rollout parameters.
// Immediately updates client runtime feature availability and experimental UI flows.
/** Create or update a feature flag by key (PUT = upsert). */
export async function upsertFeatureFlag(key: string, body: FeatureFlagUpsertRequest) {
  return apiClient(`/feature-flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<FeatureFlagUpsertResponse>;
}

// Permanently removes a feature flag definition from the active organization.
// Dispatches an authenticated DELETE request targeting the specified feature key.
// Reverts dependent client interfaces to their default fallback implementation.
/** Delete a feature flag by key. */
export async function deleteFeatureFlag(key: string) {
  return apiClient(`/feature-flags/${encodeURIComponent(key)}`, {
    method: "DELETE",
  }) as Promise<FeatureFlagDeleteResponse>;
}

// Fetches high-level macro analytics metrics aggregated for a designated period.
// Formulates query parameters specifying target period keys or billing cycles.
// Dispatches an authenticated GET request loading platform executive summaries.
/** Fetch a high-level analytics overview, optionally scoped to a period. */
export async function getAnalyticsOverview(periodKey?: string) {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/analytics/overview${query}`) as Promise<AnalyticsOverviewResponse>;
}

