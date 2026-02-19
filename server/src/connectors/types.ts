import type mongoose from "mongoose";

import type { MutationSource } from "../types/provenance";

export type ConnectorKey = "bank_stub" | "transactions_csv" | "receipts_ocr";

export type ConnectorCatalogEntry = {
  connector_key: ConnectorKey;
  name: string;
  category: "banking" | "file_import" | "documents";
  supports_webhook: boolean;
  stub_mode: boolean;
};

export type ConnectorSyncOptions = {
  /**
   * Optional override for connectors that support synthetic sync (useful in local/dev and tests).
   */
  records_synced?: number;
};

export type ConnectorContext = {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  syncRunId: string;
  requestId?: string;
  source: MutationSource;
};

export type ConnectorSyncResult = {
  records_synced: number;
  metadata?: Record<string, unknown>;
};

export interface IntegrationConnector {
  key: ConnectorKey;
  catalog: ConnectorCatalogEntry;
  sync: (ctx: ConnectorContext, options?: ConnectorSyncOptions) => Promise<ConnectorSyncResult>;
}
