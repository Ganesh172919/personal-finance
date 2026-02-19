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
