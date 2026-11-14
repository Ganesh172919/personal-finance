import type { ConnectorCatalogEntry, ConnectorKey, IntegrationConnector } from "./types";
import { bankStubConnector } from "./bankStubConnector";
import { HttpError } from "../middleware/httpError";

// In-memory mapping linking normalized connector key identifiers to connector instances.
// Stores active built-in and dynamic third-party integration connector implementations.
// Used for catalog listing and lookup dispatch across integration synchronization routes.
const registry = new Map<string, IntegrationConnector>();
// Set tracking immutable keys reserved for core built-in integration connectors.
// Prevents dynamic plugin registrations from overwriting or deregistering built-ins.
// Guards bank_stub, transactions_csv, and receipts_ocr from accidental modification.
const builtinConnectors = new Set<string>();

// Trims and downcases connector identification keys to enforce consistent lookup hashing.
// Eliminates whitespace and casing discrepancies during connector retrieval.
// Returns standardized lower-case string key representations.
const normalizeKey = (value: string) => String(value || "").trim().toLowerCase();

// Registers a built-in connector into the active registry and marks its key immutable.
// Normalizes the connector key before storing in both the map and protected set.
// Called during module boot to prime the standard catalog of core integrations.
const registerBuiltin = (connector: IntegrationConnector) => {
  const key = normalizeKey(connector.key);
  builtinConnectors.add(key);
  registry.set(key, connector);
};

// Factory creating a placeholder stub connector returning simulated sync counts.
// Configures minimal catalog attributes and a no-op sync handler for testing interfaces.
// Used for built-in file import and OCR document connectors before full external linking.
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

// Returns an array of catalog descriptors representing all registered connectors.
// Extracts the catalog metadata object from each connector currently in the registry.
// Exposes available integrations to client settings and marketplace management views.
export const listConnectorCatalog = (): ConnectorCatalogEntry[] =>
  Array.from(registry.values()).map((connector) => connector.catalog);

// Retrieves a connector by its key or throws a 404 HTTP exception if not found.
// Normalizes the search key and queries the internal registry map.
// Ensures that missing connector configurations trigger proper API error responses.
export const getConnectorOrThrow = (connectorKey: string): IntegrationConnector => {
  const normalized = normalizeKey(connectorKey);
  const found = registry.get(normalized);
  if (!found) {
    throw new HttpError(404, "INTEGRATION_NOT_FOUND", "Connector not found");
  }
  return found;
};

// Inserts or updates a dynamic third-party connector into the runtime registry.
// Disallows overriding reserved keys registered by core built-in connectors.
// Allows external plugins and extensions to mount custom integration connectors.
export const upsertConnector = (connector: IntegrationConnector) => {
  const key = normalizeKey(connector.key);
  if (builtinConnectors.has(key)) {
    throw new Error(`Cannot override builtin connector: ${key}`);
  }
  registry.set(key, connector);
};

// Removes a dynamically registered integration connector from the runtime registry.
// Protects core built-in connectors from deletion by checking the builtin whitelist.
// Returns a boolean indicating whether the connector was successfully deleted.
export const unregisterConnector = (connectorKey: string) => {
  const normalized = normalizeKey(connectorKey);
  if (!normalized) return false;
  if (builtinConnectors.has(normalized)) return false;
  return registry.delete(normalized);
};

