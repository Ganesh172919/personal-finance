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
} from "@finwise/sdk-ts";

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

export async function installMarketplacePlugin(body: MarketplaceInstallRequest) {
  return apiClient("/v1/marketplace/install", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<MarketplaceInstallResponse>;
}

export async function listInstalledPlugins() {
  return apiClient("/v1/plugins") as Promise<PluginsListResponse>;
}

export async function updateInstalledPluginVersion(pluginKey: string, version: string) {
  return apiClient(`/v1/plugins/${encodeURIComponent(pluginKey)}/update`, {
    method: "POST",
    body: JSON.stringify({ version }),
  }) as Promise<PluginOperationResponse>;
}

export async function uninstallInstalledPlugin(pluginKey: string) {
  return apiClient(`/v1/plugins/${encodeURIComponent(pluginKey)}/uninstall`, {
    method: "POST",
  }) as Promise<PluginOperationResponse>;
}

export async function listIntegrations() {
  return apiClient("/v1/integrations") as Promise<IntegrationsListResponse>;
}

export async function syncIntegration(connectorKey: string, body: IntegrationSyncRequest = {}) {
  return apiClient(`/v1/integrations/${encodeURIComponent(connectorKey)}/sync`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<IntegrationSyncResponse>;
}

export async function getIntegrationHistory(connectorKey: string, limit?: number) {
  const query = typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return apiClient(`/v1/integrations/${encodeURIComponent(connectorKey)}/history${query}`) as Promise<IntegrationHistoryResponse>;
}

export async function listAutomationEvents() {
  return apiClient("/v1/automation/events") as Promise<AutomationEventsCatalogResponse>;
}

export async function emitAutomationEvent(body: AutomationEventEmitRequest) {
  return apiClient("/v1/automation/events/emit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AutomationEventEmitResponse>;
}

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

export async function upsertFeatureFlag(key: string, body: FeatureFlagUpsertRequest) {
  return apiClient(`/v1/feature-flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<FeatureFlagUpsertResponse>;
}

export async function deleteFeatureFlag(key: string) {
  return apiClient(`/v1/feature-flags/${encodeURIComponent(key)}`, {
    method: "DELETE",
  }) as Promise<FeatureFlagDeleteResponse>;
}

export async function getAnalyticsOverview(periodKey?: string) {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/v1/analytics/overview${query}`) as Promise<AnalyticsOverviewResponse>;
}
