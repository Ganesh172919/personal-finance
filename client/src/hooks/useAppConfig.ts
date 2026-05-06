/**
 * @fileoverview App Configuration Hook
 *
 * Fetches the current user's merged configuration (user + organization settings).
 * The config includes locale, currency, timezone, feature flags, and plan details.
 *
 * CACHING STRATEGY:
 * - staleTime: 30s — config rarely changes during a session
 * - Query key: ["/api/config/me"] — matches the API endpoint path
 * - Used by useOrgFormatters and other hooks that need org-level settings
 *
 * WHY A DEDICATED HOOK?
 * The config is needed by multiple components (formatters, feature gates, etc.).
 * A shared hook ensures consistent caching and prevents duplicate requests.
 *
 * @module hooks/useAppConfig
 */

import { useQuery } from "@tanstack/react-query";

import { getMyConfig, type AppConfig } from "@/lib/apiClient";

/**
 * Fetches the current user's app configuration.
 *
 * @param options.enabled - Whether to enable the query (default: true)
 * @returns React Query result with AppConfig data
 */
export const useAppConfig = (options: { enabled?: boolean } = {}) => {
  return useQuery<AppConfig>({
    queryKey: ["/api/config/me"],
    queryFn: getMyConfig,
    staleTime: 30_000, // Config rarely changes — cache for 30s
    enabled: options.enabled ?? true,
  });
};
