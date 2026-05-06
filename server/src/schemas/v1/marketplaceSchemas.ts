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

const pluginKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid plugin key");

export const pluginKeyParamSchema = z
  .object({
    id: pluginKeySchema,
  })
  .strict();

export const marketplaceCatalogQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "preview", "deprecated"]).optional(),
  })
  .strict();

export const installMarketplacePluginBodySchema = z
  .object({
    plugin_key: pluginKeySchema,
    version: z.string().trim().min(1).max(40).optional(),
    permissions: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

export const updateInstalledPluginBodySchema = z
  .object({
    version: z.string().trim().min(1).max(40),
  })
  .strict();
