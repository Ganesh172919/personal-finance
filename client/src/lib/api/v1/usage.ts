import { apiClient } from "../core";

import type { UsageLedgerResponse as SdkUsageLedgerResponse, UsageLedgerRow as SdkUsageLedgerRow } from "@/types/apiTypes";

export type UsageLedgerRow = SdkUsageLedgerRow;
export type UsageLedgerResponse = SdkUsageLedgerResponse;

export async function getUsageLedger(periodKey?: string): Promise<UsageLedgerResponse> {
  const query = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
  return apiClient(`/v1/usage/ledger${query}`);
}


