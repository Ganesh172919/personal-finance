import type { ConnectorCatalogEntry, ConnectorKey, IntegrationConnector } from "./types";
import { bankStubConnector } from "./bankStubConnector";
import { HttpError } from "../middleware/httpError";

const stubNoopConnector = (params: {
  key: Exclude<ConnectorKey, "bank_stub">;
  name: string;
  category: ConnectorCatalogEntry["category"];
}): IntegrationConnector => ({
  key: params.key,
  catalog: {
    connector_key: params.key,
    name: params.name,
    category: params.category,
    supports_webhook: false,
    stub_mode: true,
  },
  sync: async (_ctx, options) => ({
    records_synced: Math.max(0, Math.floor(Number(options?.records_synced || 0))),
    metadata: { stub_mode: true },
  }),
});

const connectors: Record<ConnectorKey, IntegrationConnector> = {
  bank_stub: bankStubConnector,
  transactions_csv: stubNoopConnector({
    key: "transactions_csv",
    name: "Transactions CSV Import",
    category: "file_import",
  }),
  receipts_ocr: stubNoopConnector({
    key: "receipts_ocr",
    name: "Receipts OCR Sync",
    category: "documents",
  }),
};

export const listConnectorCatalog = (): ConnectorCatalogEntry[] =>
  Object.values(connectors).map((connector) => connector.catalog);

export const getConnectorOrThrow = (connectorKey: string): IntegrationConnector => {
  const normalized = String(connectorKey || "").trim().toLowerCase() as ConnectorKey;
  const found = connectors[normalized];
  if (!found) {
    throw new HttpError(404, "INTEGRATION_NOT_FOUND", "Connector not found");
  }
  return found;
};
