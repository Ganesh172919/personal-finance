/**
 * @fileoverview Zod validation schemas for marketplace plugin management.
 *
 * Exported schemas:
 *   pluginKeyParamSchema              - Validates plugin key route param (:id, lowercase alphanumeric key)
 *   marketplaceCatalogQuerySchema     - Validates catalog search query (q, status filter)
 *   installMarketplacePluginBodySchema - Validates installing a plugin (plugin_key, version, permissions)
 *   updateInstalledPluginBodySchema   - Validates updating an installed plugin's version
 *
 * Used by: v1Routes (GET /marketplace/catalog, POST /marketplace/install,
 *          POST /plugins/:id/update, POST /plugins/:id/uninstall)
 *
 * Key validation rules:
 *   - Plugin key: 3-120 chars, lowercase alphanumeric with . _ - : separators
 *   - Catalog status filter: active | preview | deprecated
 *   - Install body: plugin_key required, version optional (1-40 chars),
 *     permissions array up to 100 items (each 1-120 chars)
 *   - Update body: version required, 1-40 chars
 */
import { z } from "zod";

// Validates marketplace plugin identification keys across the system.
// Enforces trimmed lowercase alphanumeric values with dot, dash, and colon delimiters.
// Restricts identifier length from 3 up to 120 characters to ensure safe namespace formats.
const pluginKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid plugin key");

// Validates route parameter objects containing a plugin identification key.
// Binds standard plugin key syntax checks to incoming route URL segments.
// Prevents invalid URI characters from proceeding to plugin loader controllers.
export const pluginKeyParamSchema = z
  .object({
    id: pluginKeySchema,
  })
  .strict();

// Validates search and status filter parameters when querying plugin marketplace catalog.
// Accepts optional text query strings up to 120 characters for keyword searching.
// Filters results against allowed publication statuses including active, preview, and deprecated.
export const marketplaceCatalogQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "preview", "deprecated"]).optional(),
  })
  .strict();

// Validates payload submitted when installing a new plugin from marketplace catalog.
// Requires valid plugin key and supports optional semver version string definitions.
// Checks requested plugin permissions array containing up to 100 trimmed permission strings.
export const installMarketplacePluginBodySchema = z
  .object({
    plugin_key: pluginKeySchema,
    version: z.string().trim().min(1).max(40).optional(),
    permissions: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

// Validates payload attributes when upgrading or pinning an installed plugin version.
// Requires a trimmed target version string between 1 and 40 characters in length.
// Disallows unrecognized update fields through strict schema validation rules.
export const updateInstalledPluginBodySchema = z
  .object({
    version: z.string().trim().min(1).max(40),
  })
  .strict();
