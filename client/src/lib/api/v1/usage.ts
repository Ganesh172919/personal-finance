/**
 * @fileoverview V1 Usage Tracking API
 *
 * Provides access to the organisation's usage ledger -- a record of
 * resource consumption (API calls, AI tokens, storage, etc.) broken
 * down by category and billing period.
 *
 * Key concepts:
 * - **Usage Ledger**: A per-period accounting of how the organisation
 *   has consumed platform resources. Each row represents a usage category
 *   with its count, unit, and cost.
 * - **Period Key**: Usage is bucketed by billing period (e.g., "2026-05").
 *   If omitted, returns the current period's usage.
 */

import { apiClient } from "../core";

import type { UsageLedgerResponse as SdkUsageLedgerResponse, UsageLedgerRow as SdkUsageLedgerRow } from "@/types/apiTypes";

// Represents an individual resource consumption record in the organization usage ledger.
// Tracks consumed resource metric units, billing period keys, and associated costs.
// Powers billing breakdown line items and quota consumption progress meters.
export type UsageLedgerRow = SdkUsageLedgerRow;

// Encapsulates the complete usage ledger report response for a tenant billing period.
// Combines resource consumption rows alongside organization identifiers and period tags.
// Feeds billing dashboard overviews and subscription tier threshold alerts.
export type UsageLedgerResponse = SdkUsageLedgerResponse;

// Retrieves the organization resource consumption ledger for an optional period key.
// Formulates query parameters for custom historical or active billing periods.
// Dispatches an authenticated GET request loading consumption and cost metrics.
/** Fetch the usage ledger for a billing period (defaults to current period). */
export async function getUsageLedger(periodKey?: string): Promise<UsageLedgerResponse> {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/usage/ledger${query}`);
}


