export type Risk = "low" | "medium" | "high";
export type Role = "member" | "admin" | "owner";

export type RequiredEntitlement = {
  feature: string;
  units?: number;
};

export type PluginToolDefinition = {
  tool: string;
  handler: string;
  title: string;
  description: string;
  risk_default: Risk;
  requires_confirmation_default: boolean;
  required_role: Role;
  required_entitlement?: RequiredEntitlement;
  args_schema: Record<string, unknown>;
  args_example: Record<string, unknown>;
};

export type PluginConnectorDefinition = {
  connector_key: string;
  handler: string;
  name: string;
  category: "banking" | "file_import" | "documents";
  supports_webhook: boolean;
  stub_mode: boolean;
};

export type PluginManifest = {
  plugin_key: string;
  version: string;
  publisher: string;
  permissions: string[];
  entrypoints: { module: string };
  tools: PluginToolDefinition[];
  connectors: PluginConnectorDefinition[];
  workflow_templates?: unknown[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireString = (obj: Record<string, unknown>, key: string, { min = 1, max = 500 } = {}) => {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) throw new Error(`${key} must be at least ${min} chars`);
  if (trimmed.length > max) throw new Error(`${key} must be at most ${max} chars`);
  return trimmed;
};

const requireBool = (obj: Record<string, unknown>, key: string) => {
  const value = obj[key];
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
};

const requireArray = (obj: Record<string, unknown>, key: string) => {
  const value = obj[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value;
};

const requireRisk = (obj: Record<string, unknown>, key: string): Risk => {
  const value = requireString(obj, key, { min: 3, max: 20 }).toLowerCase();
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`${key} must be one of low|medium|high`);
};

const requireRole = (obj: Record<string, unknown>, key: string): Role => {
  const value = requireString(obj, key, { min: 3, max: 20 }).toLowerCase();
  if (value === "member" || value === "admin" || value === "owner") return value;
  throw new Error(`${key} must be one of member|admin|owner`);
};

const requireRecord = (obj: Record<string, unknown>, key: string) => {
  const value = obj[key];
  if (!isPlainObject(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value;
};

const normalizeTool = (value: string) => {
  const normalized = value.trim();
  if (!/^plugin\.[a-z0-9][a-z0-9._-]{2,190}$/i.test(normalized)) {
    throw new Error(`Invalid tool name: ${value}`);
  }
  return normalized;
};

const normalizePluginKey = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,118}[a-z0-9]$/.test(normalized)) {
    throw new Error(`Invalid plugin_key: ${value}`);
  }
  return normalized;
};

export const parseManifest = (payload: unknown): PluginManifest => {
  if (!isPlainObject(payload)) {
    throw new Error("Manifest must be an object");
  }

  const plugin_key = normalizePluginKey(requireString(payload, "plugin_key", { min: 3, max: 120 }));
  const version = requireString(payload, "version", { min: 1, max: 60 });
  const publisher = requireString(payload, "publisher", { min: 1, max: 120 });

  const permissionsRaw = requireArray(payload, "permissions");
  const permissions = permissionsRaw.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 200);

  const entrypointsObj = requireRecord(payload, "entrypoints");
  const entrypoints = {
    module: requireString(entrypointsObj, "module", { min: 3, max: 200 }),
  };

  const toolsRaw = requireArray(payload, "tools");
  const tools: PluginToolDefinition[] = toolsRaw.map((row, idx) => {
    if (!isPlainObject(row)) {
      throw new Error(`tools[${idx}] must be an object`);
    }

    const tool = normalizeTool(requireString(row, "tool", { min: 8, max: 200 }));
    const handler = requireString(row, "handler", { min: 1, max: 120 });
    const title = requireString(row, "title", { min: 2, max: 160 });
    const description = requireString(row, "description", { min: 2, max: 2000 });
    const risk_default = requireRisk(row, "risk_default");
    const requires_confirmation_default = requireBool(row, "requires_confirmation_default");
    const required_role = requireRole(row, "required_role");

    const args_schema = requireRecord(row, "args_schema");
    const args_example = requireRecord(row, "args_example");

    let required_entitlement: RequiredEntitlement | undefined;
    if (row.required_entitlement !== undefined) {
      const ent = row.required_entitlement;
      if (!isPlainObject(ent)) {
        throw new Error(`tools[${idx}].required_entitlement must be an object`);
      }
      const feature = requireString(ent, "feature", { min: 1, max: 120 });
      const unitsRaw = ent.units;
      const units = unitsRaw === undefined ? undefined : Math.max(0, Math.floor(Number(unitsRaw)));
      required_entitlement = { feature, units };
    }

    return {
      tool,
      handler,
      title,
      description,
      risk_default,
      requires_confirmation_default,
      required_role,
      required_entitlement,
      args_schema,
      args_example,
    };
  });

  const connectorsRaw = payload.connectors ? requireArray(payload, "connectors") : [];
  const connectors: PluginConnectorDefinition[] = connectorsRaw.map((row, idx) => {
    if (!isPlainObject(row)) {
      throw new Error(`connectors[${idx}] must be an object`);
    }
    const connector_key = requireString(row, "connector_key", { min: 2, max: 160 }).toLowerCase();
    const handler = requireString(row, "handler", { min: 1, max: 120 });
    const name = requireString(row, "name", { min: 2, max: 200 });
    const category = requireString(row, "category", { min: 2, max: 50 }) as PluginConnectorDefinition["category"];
    if (category !== "banking" && category !== "file_import" && category !== "documents") {
      throw new Error(`connectors[${idx}].category must be banking|file_import|documents`);
    }
    const supports_webhook = requireBool(row, "supports_webhook");
    const stub_mode = requireBool(row, "stub_mode");
    return { connector_key, handler, name, category, supports_webhook, stub_mode };
  });

  return {
    plugin_key,
    version,
    publisher,
    permissions,
    entrypoints,
    tools,
    connectors,
    workflow_templates: payload.workflow_templates,
  };
};

