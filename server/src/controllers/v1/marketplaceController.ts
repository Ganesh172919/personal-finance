import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import MarketplacePluginModel from "../../models/marketplacePluginModel";
import PluginInstallModel from "../../models/pluginInstallModel";
import { HttpError } from "../../middleware/httpError";
import { enforceFeatureLimit, recordFeatureUsage } from "../../services/entitlements";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

type CatalogPlugin = {
  plugin_key: string;
  name: string;
  description: string;
  publisher: string;
  status: "active" | "preview" | "deprecated";
  latest_version: string;
  available_versions: string[];
  permissions: string[];
  pricing_model: "free" | "paid";
  price_monthly_usd: number | null;
};

const FALLBACK_MARKETPLACE_CATALOG: CatalogPlugin[] = [
  {
    plugin_key: "finwise.connector.bank_stub",
    name: "Bank Connector (Stub)",
    description: "Local-first bank sync connector for sandbox and development use.",
    publisher: "FinWise Labs",
    status: "active",
    latest_version: "1.0.0",
    available_versions: ["1.0.0"],
    permissions: ["transactions:read", "transactions:write"],
    pricing_model: "free",
    price_monthly_usd: null,
  },
  {
    plugin_key: "finwise.automation.digest_plus",
    name: "Digest Plus",
    description: "Enhanced weekly digest templates with KPI snippets and team rollups.",
    publisher: "FinWise Labs",
    status: "preview",
    latest_version: "0.3.0",
    available_versions: ["0.3.0", "0.2.1"],
    permissions: ["workflows:read", "workflows:write"],
    pricing_model: "paid",
    price_monthly_usd: 19,
  },
  {
    plugin_key: "finwise.sample",
    name: "Sample Plugin Tools",
    description: "Fixture plugin for local development (adds a safe echo tool).",
    publisher: "FinWise Labs",
    status: "preview",
    latest_version: "1.0.0",
    available_versions: ["1.0.0"],
    permissions: ["transactions:read"],
    pricing_model: "free",
    price_monthly_usd: null,
  },
];

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toCatalogPlugin = (plugin: any): CatalogPlugin => ({
  plugin_key: String(plugin.pluginKey),
  name: String(plugin.name),
  description: String(plugin.description),
  publisher: String(plugin.publisher),
  status: String(plugin.status) as CatalogPlugin["status"],
  latest_version: String(plugin.latestVersion),
  available_versions: Array.isArray(plugin.availableVersions)
    ? plugin.availableVersions.map((version: unknown) => String(version))
    : [],
  permissions: Array.isArray(plugin.permissions) ? plugin.permissions.map((value: unknown) => String(value)) : [],
  pricing_model: String(plugin.pricingModel) as CatalogPlugin["pricing_model"],
  price_monthly_usd:
    typeof plugin.priceMonthlyUsd === "number" && Number.isFinite(plugin.priceMonthlyUsd)
      ? Number(plugin.priceMonthlyUsd)
      : null,
});

const loadCatalogPlugins = async (params: { q?: string; status?: CatalogPlugin["status"] }) => {
  const filters: Record<string, unknown> = {};
  if (params.status) {
    filters.status = params.status;
  }
  if (params.q) {
    const q = escapeRegExp(params.q.trim());
    filters.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { pluginKey: { $regex: q, $options: "i" } },
      { publisher: { $regex: q, $options: "i" } },
    ];
  }

  const dbRows = await MarketplacePluginModel.find(filters)
    .sort({ updatedAt: -1 })
    .select({
      pluginKey: 1,
      name: 1,
      description: 1,
      publisher: 1,
      status: 1,
      latestVersion: 1,
      availableVersions: 1,
      permissions: 1,
      pricingModel: 1,
      priceMonthlyUsd: 1,
    })
    .lean();

  if (dbRows.length > 0) {
    return dbRows.map(toCatalogPlugin);
  }

  return FALLBACK_MARKETPLACE_CATALOG.filter((plugin) => {
    if (params.status && plugin.status !== params.status) {
      return false;
    }
    if (!params.q) {
      return true;
    }
    const needle = params.q.toLowerCase();
    return (
      plugin.plugin_key.toLowerCase().includes(needle) ||
      plugin.name.toLowerCase().includes(needle) ||
      plugin.description.toLowerCase().includes(needle) ||
      plugin.publisher.toLowerCase().includes(needle)
    );
  });
};

const findCatalogPluginByKey = async (pluginKey: string) => {
  const dbRow = await MarketplacePluginModel.findOne({ pluginKey })
    .select({
      pluginKey: 1,
      name: 1,
      description: 1,
      publisher: 1,
      status: 1,
      latestVersion: 1,
      availableVersions: 1,
      permissions: 1,
      pricingModel: 1,
      priceMonthlyUsd: 1,
    })
    .lean();
  if (dbRow) {
    return toCatalogPlugin(dbRow);
  }
  return FALLBACK_MARKETPLACE_CATALOG.find((plugin) => plugin.plugin_key === pluginKey) || null;
};

export const listMarketplaceCatalog = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const query = req.query as { q?: string; status?: CatalogPlugin["status"] };

  const catalog = await loadCatalogPlugins({ q: query.q, status: query.status });
  const installs = await PluginInstallModel.find({ orgId })
    .select({ pluginKey: 1, version: 1, status: 1, updatedAt: 1 })
    .lean();
  const installByKey = new Map(installs.map((row: any) => [String(row.pluginKey), row]));

  return res.json({
    org_id: orgId.toString(),
    plugins: catalog.map((plugin) => {
      const install = installByKey.get(plugin.plugin_key);
      return {
        ...plugin,
        installed: Boolean(install && install.status === "installed"),
        installed_version: install ? String((install as any).version) : null,
        installed_status: install ? String((install as any).status) : null,
        installed_updated_at: install?.updatedAt || null,
      };
    }),
    request_id: req.requestId,
  });
};

export const installMarketplacePlugin = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "marketplace_installs",
    units: 1,
    requestId: req.requestId,
  });

  const body = req.body as {
    plugin_key: string;
    version?: string;
    permissions?: string[];
  };

  const pluginKey = String(body.plugin_key || "").trim().toLowerCase();
  const plugin = await findCatalogPluginByKey(pluginKey);
  if (!plugin) {
    throw new HttpError(404, "PLUGIN_NOT_FOUND", "Plugin not found in marketplace catalog");
  }

  const version = body.version?.trim() || plugin.latest_version;
  if (!plugin.available_versions.includes(version)) {
    throw new HttpError(400, "INVALID_PLUGIN_VERSION", "Requested plugin version is not available", {
      plugin_key: plugin.plugin_key,
      requested_version: version,
    });
  }

  const permissionsGranted =
    Array.isArray(body.permissions) && body.permissions.length > 0 ? body.permissions : plugin.permissions;

  const installed = await PluginInstallModel.findOneAndUpdate(
    { orgId, pluginKey: plugin.plugin_key },
    {
      $set: {
        version,
        status: "installed",
        permissionsGranted: permissionsGranted.map((permission) => String(permission)),
        updatedByUserId: user._id,
      },
      $setOnInsert: {
        orgId,
        pluginKey: plugin.plugin_key,
        installedByUserId: user._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .select({ pluginKey: 1, version: 1, status: 1, permissionsGranted: 1, createdAt: 1, updatedAt: 1 })
    .lean();

  await recordFeatureUsage({
    orgId,
    userId: user._id,
    feature: "marketplace_installs",
    units: 1,
    requestId: req.requestId,
    context: { plugin_key: plugin.plugin_key, version },
  });

  return res.status(201).json({
    org_id: orgId.toString(),
    install: {
      plugin_key: String((installed as any).pluginKey),
      version: String((installed as any).version),
      status: String((installed as any).status),
      permissions: Array.isArray((installed as any).permissionsGranted)
        ? (installed as any).permissionsGranted.map((permission: unknown) => String(permission))
        : [],
      created_at: (installed as any).createdAt || null,
      updated_at: (installed as any).updatedAt || null,
    },
    request_id: req.requestId,
  });
};

export const listInstalledPlugins = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);

  const installs = await PluginInstallModel.find({ orgId })
    .sort({ updatedAt: -1 })
    .select({ pluginKey: 1, version: 1, status: 1, permissionsGranted: 1, createdAt: 1, updatedAt: 1 })
    .lean();

  const pluginKeys = installs.map((install: any) => String(install.pluginKey));
  const catalogRows = pluginKeys.length
    ? await MarketplacePluginModel.find({ pluginKey: { $in: pluginKeys } })
        .select({ pluginKey: 1, name: 1, publisher: 1 })
        .lean()
    : [];
  const catalogByKey = new Map(catalogRows.map((row: any) => [String(row.pluginKey), row]));

  return res.json({
    org_id: orgId.toString(),
    plugins: installs.map((install: any) => {
      const pluginKey = String(install.pluginKey);
      const catalog = catalogByKey.get(pluginKey);
      const fallback = FALLBACK_MARKETPLACE_CATALOG.find((entry) => entry.plugin_key === pluginKey);
      return {
        plugin_key: pluginKey,
        name: catalog ? String((catalog as any).name) : fallback?.name || pluginKey,
        publisher: catalog ? String((catalog as any).publisher) : fallback?.publisher || "Unknown",
        version: String(install.version),
        status: String(install.status),
        permissions: Array.isArray(install.permissionsGranted)
          ? install.permissionsGranted.map((permission: unknown) => String(permission))
          : [],
        created_at: install.createdAt || null,
        updated_at: install.updatedAt || null,
      };
    }),
    request_id: req.requestId,
  });
};

export const uninstallPlugin = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  const pluginKey = String((req.params as any).id || "").trim().toLowerCase();

  const updated = await PluginInstallModel.findOneAndUpdate(
    { orgId, pluginKey },
    {
      $set: {
        status: "disabled",
        updatedByUserId: user?._id,
      },
    },
    { new: true }
  )
    .select({ pluginKey: 1, version: 1, status: 1, updatedAt: 1 })
    .lean();

  if (!updated) {
    throw new HttpError(404, "PLUGIN_NOT_INSTALLED", "Plugin is not installed in this organization");
  }

  return res.json({
    org_id: orgId.toString(),
    plugin: {
      plugin_key: String((updated as any).pluginKey),
      version: String((updated as any).version),
      status: String((updated as any).status),
      updated_at: (updated as any).updatedAt || null,
    },
    request_id: req.requestId,
  });
};

export const updateInstalledPluginVersion = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  const pluginKey = String((req.params as any).id || "").trim().toLowerCase();
  const body = req.body as { version: string };
  const version = String(body.version || "").trim();

  const plugin = await findCatalogPluginByKey(pluginKey);
  if (plugin && !plugin.available_versions.includes(version)) {
    throw new HttpError(400, "INVALID_PLUGIN_VERSION", "Requested plugin version is not available", {
      plugin_key: plugin.plugin_key,
      requested_version: version,
    });
  }

  const updated = await PluginInstallModel.findOneAndUpdate(
    { orgId, pluginKey },
    {
      $set: {
        version,
        status: "installed",
        updatedByUserId: user?._id,
      },
    },
    { new: true }
  )
    .select({ pluginKey: 1, version: 1, status: 1, updatedAt: 1 })
    .lean();

  if (!updated) {
    throw new HttpError(404, "PLUGIN_NOT_INSTALLED", "Plugin is not installed in this organization");
  }

  return res.json({
    org_id: orgId.toString(),
    plugin: {
      plugin_key: String((updated as any).pluginKey),
      version: String((updated as any).version),
      status: String((updated as any).status),
      updated_at: (updated as any).updatedAt || null,
    },
    request_id: req.requestId,
  });
};
