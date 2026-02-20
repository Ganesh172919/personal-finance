import type { ConnectorCatalogEntry, ConnectorKey, IntegrationConnector } from "./types";
import { bankStubConnector } from "./bankStubConnector";
import { HttpError } from "../middleware/httpError";

const registry = new Map<string, IntegrationConnector>();
const builtinConnectors = new Set<string>();

const normalizeKey = (value: string) => String(value || "").trim().toLowerCase();

const registerBuiltin = (connector: IntegrationConnector) => {
  const key = normalizeKey(connector.key);
  builtinConnectors.add(key);
  registry.set(key, connector);
};

const stubNoopConnector = (params: {
  key: string;
  name: string;
  category: ConnectorCatalogEntry["category"];
}): IntegrationConnector => ({
  key: params.key,
  catalog: {
    connector_key: params.key as ConnectorKey,
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

registerBuiltin(bankStubConnector);
registerBuiltin(
  stubNoopConnector({
    key: "transactions_csv",
    name: "Transactions CSV Import",
    category: "file_import",
  })
);
registerBuiltin(
  stubNoopConnector({
    key: "receipts_ocr",
    name: "Receipts OCR Sync",
    category: "documents",
  })
);

export const listConnectorCatalog = (): ConnectorCatalogEntry[] =>
  Array.from(registry.values()).map((connector) => connector.catalog);

export const getConnectorOrThrow = (connectorKey: string): IntegrationConnector => {
  const normalized = normalizeKey(connectorKey);
  const found = registry.get(normalized);
  if (!found) {
    throw new HttpError(404, "INTEGRATION_NOT_FOUND", "Connector not found");
  }
  return found;
};

export const upsertConnector = (connector: IntegrationConnector) => {
  const key = normalizeKey(connector.key);
  if (builtinConnectors.has(key)) {
    throw new Error(`Cannot override builtin connector: ${key}`);
  }
  registry.set(key, connector);
};

export const unregisterConnector = (connectorKey: string) => {
  const normalized = normalizeKey(connectorKey);
  if (!normalized) return false;
  if (builtinConnectors.has(normalized)) return false;
  return registry.delete(normalized);
};

