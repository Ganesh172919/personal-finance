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
  return apiClient(`/v1/marketplace/catalog${suffix}`) as Promise<MarketplaceCatalogResponse>;
}

/** Install a plugin from the marketplace. */
export async function installMarketplacePlugin(body: MarketplaceInstallRequest) {
  return apiClient("/v1/marketplace/install", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<MarketplaceInstallResponse>;
}

/** List all plugins currently installed in the organisation. */
export async function listInstalledPlugins() {
  return apiClient("/v1/plugins") as Promise<PluginsListResponse>;
}

/** Update an installed plugin to a specific version. */
export async function updateInstalledPluginVersion(pluginKey: string, version: string) {
  return apiClient(`/v1/plugins/${encodeURIComponent(pluginKey)}/update`, {
    method: "POST",
    body: JSON.stringify({ version }),
  }) as Promise<PluginOperationResponse>;
}

/** Uninstall a plugin from the organisation. */
export async function uninstallInstalledPlugin(pluginKey: string) {
  return apiClient(`/v1/plugins/${encodeURIComponent(pluginKey)}/uninstall`, {
    method: "POST",
  }) as Promise<PluginOperationResponse>;
}

/** ─── Integrations ─────────────────────────────────────────────── */

/** List all third-party integrations (connectors) for the organisation. */
export async function listIntegrations() {
  return apiClient("/v1/integrations") as Promise<IntegrationsListResponse>;
}

/** Trigger a sync for a specific integration connector. */
export async function syncIntegration(connectorKey: string, body: IntegrationSyncRequest = {}) {
  return apiClient(`/v1/integrations/${encodeURIComponent(connectorKey)}/sync`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<IntegrationSyncResponse>;
}

/** Fetch recent sync history for a specific integration connector. */
export async function getIntegrationHistory(connectorKey: string, limit?: number) {
  const query = typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return apiClient(`/v1/integrations/${encodeURIComponent(connectorKey)}/history${query}`) as Promise<IntegrationHistoryResponse>;
}

/** ─── CSV Import ───────────────────────────────────────────────── */

/** Column mapping from CSV headers to transaction fields. */
export type TransactionsCsvImportMapping = {
  amount: string;
  date: string;
  description?: string;
  category?: string;
  type?: string;
  merchant?: string;
};

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

  return apiClient("/v1/integrations/transactions_csv/import", {
    method: "POST",
    body: form,
  }) as Promise<TransactionsCsvImportResponse>;
}

/** ─── Automation Events ────────────────────────────────────────── */

/** List the catalog of available automation event types. */
export async function listAutomationEvents() {
  return apiClient("/v1/automation/events") as Promise<AutomationEventsCatalogResponse>;
}

/** Emit an automation event that may trigger workflows or other reactions. */
export async function emitAutomationEvent(body: AutomationEventEmitRequest) {
  return apiClient("/v1/automation/events/emit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutomationEventEmitResponse>;
}

/** ─── Feature Flags ────────────────────────────────────────────── */

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
  return apiClient(`/v1/feature-flags${suffix}`) as Promise<FeatureFlagsListResponse>;
}

/** Create or update a feature flag by key (PUT = upsert). */
export async function upsertFeatureFlag(key: string, body: FeatureFlagUpsertRequest) {
  return apiClient(`/v1/feature-flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<FeatureFlagUpsertResponse>;
}

/** Delete a feature flag by key. */
export async function deleteFeatureFlag(key: string) {
  return apiClient(`/v1/feature-flags/${encodeURIComponent(key)}`, {
    method: "DELETE",
  }) as Promise<FeatureFlagDeleteResponse>;
}

/** Fetch a high-level analytics overview, optionally scoped to a period. */
export async function getAnalyticsOverview(periodKey?: string) {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/v1/analytics/overview${query}`) as Promise<AnalyticsOverviewResponse>;
}

