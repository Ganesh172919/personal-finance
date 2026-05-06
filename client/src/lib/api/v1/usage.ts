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

export type UsageLedgerRow = SdkUsageLedgerRow;
export type UsageLedgerResponse = SdkUsageLedgerResponse;

/** Fetch the usage ledger for a billing period (defaults to current period). */
export async function getUsageLedger(periodKey?: string): Promise<UsageLedgerResponse> {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/v1/usage/ledger${query}`);
}


