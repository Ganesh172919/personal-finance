import type mongoose from "mongoose";

import type { MutationSource } from "../types/provenance";

// String literal union identifying built-in third-party financial data connectors.
// Covers dummy banking stub, CSV transaction upload, and receipt OCR services.
// Constrains core connector identifiers to registered internal connector implementations.
export type BuiltinConnectorKey = "bank_stub" | "transactions_csv" | "receipts_ocr";
// Flexible type alias accepting built-in connector keys or arbitrary string extension keys.
// Employs TypeScript pattern to preserve editor autocompletion for built-in keys.
// Supports dynamic plugin connectors registered at runtime.
export type ConnectorKey = BuiltinConnectorKey | (string & {});

// Catalog manifest descriptor defining metadata for an integration connector.
// Encapsulates connector key, human-readable name, domain category, and feature flags.
// Informs API catalog endpoints and UI directory listings of available integrations.
export type ConnectorCatalogEntry = {
  connector_key: ConnectorKey;
  name: string;
  category: "banking" | "file_import" | "documents";
  supports_webhook: boolean;
  stub_mode: boolean;
};

// Optional parameters supplied when initiating a connector synchronization cycle.
// Provides record count overrides for synthetic test syncs in development environments.
// Passed to connector sync handlers to tune batch processing parameters.
export type ConnectorSyncOptions = {
  /**
   * Optional override for connectors that support synthetic sync (useful in local/dev and tests).
   */
  records_synced?: number;
};

// Execution context provided to connector instances during synchronization runs.
// Injects authenticated organization ID, user ID, sync run ID, and audit provenance.
// Ensures operations have complete tracing and authorization boundaries.
export type ConnectorContext = {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  syncRunId: string;
  requestId?: string;
  source: MutationSource;
};

// Structured outcome payload produced after executing a connector sync routine.
// Reports total record tally ingested alongside arbitrary execution metadata.
// Persisted in sync history logs to track connector throughput and anomalies.
export type ConnectorSyncResult = {
  records_synced: number;
  metadata?: Record<string, unknown>;
};

// Contract defining methods and metadata required for an integration connector.
// Binds unique connector key, catalog descriptor, and asynchronous sync runner.
// Establishes common interface implemented by all data ingestion connectors.
export interface IntegrationConnector {
  key: ConnectorKey;
  catalog: ConnectorCatalogEntry;
  sync: (ctx: ConnectorContext, options?: ConnectorSyncOptions) => Promise<ConnectorSyncResult>;
}
