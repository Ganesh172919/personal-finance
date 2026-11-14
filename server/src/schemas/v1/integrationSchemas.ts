/**
 * @fileoverview Zod validation schemas for third-party integration management.
 *
 * Exported schemas:
 *   integrationIdParamSchema         - Validates integration/connector ID (:id param, lowercase alphanumeric key)
 *   integrationHistoryQuerySchema    - Validates query for integration sync history (limit: 1-200)
 *   integrationSyncBodySchema        - Validates triggering a sync (optional records_synced, simulate_error)
 *   integrationConnectBodySchema     - Validates connecting an integration (empty object)
 *   integrationDisconnectBodySchema  - Validates disconnecting an integration (empty object)
 *
 * Used by: v1Routes (integrations/:id/connect, /disconnect, /sync, /history, /health)
 *
 * Key validation rules:
 *   - Connector key: 3-120 chars, lowercase alphanumeric with . _ - : separators
 *   - Sync body: records_synced 0-1M, simulate_error boolean for testing
 *   - Connect/disconnect: empty strict objects (future extensibility)
 */
import { z } from "zod";

// Validates unique connector identification keys for third-party integrations.
// Enforces trimmed lowercase alphanumeric formatting with period, dash, and colon characters.
// Restricts key lengths strictly between 3 and 120 characters to maintain naming conventions.
const connectorKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid connector key");

// Validates URL route parameters identifying an integration instance by key.
// Binds connector key format validation to the route id parameter property.
// Rejects unpermitted query or path characters before integration dispatch occurs.
export const integrationIdParamSchema = z
  .object({
    id: connectorKeySchema,
  })
  .strict();

// Validates pagination query parameters for connector synchronization history logs.
// Coerces string query parameters into integer values with bounds between 1 and 200.
// Disallows unrecognized query parameters through strict schema enforcement.
export const integrationHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

// Validates payload attributes when manually triggering an integration sync job.
// Accepts optional record counts up to one million for simulated or test syncs.
// Includes a boolean flag used to simulate error scenarios during test workflows.
export const integrationSyncBodySchema = z
  .object({
    records_synced: z.number().int().min(0).max(1_000_000).optional(),
    simulate_error: z.boolean().optional(),
  })
  .strict();

// Validates the request body payload when establishing a new connector connection.
// Enforces an empty strict object to prevent unintended payload parameters.
// Defaults to an empty object structure when no payload data is provided.
export const integrationConnectBodySchema = z.object({}).strict().default({});

// Validates the request body payload when terminating an integration connection.
// Ensures strict empty object validation without superfluous parameters.
// Serves as an extensible placeholder schema for future disconnection metadata.
export const integrationDisconnectBodySchema = z.object({}).strict().default({});
