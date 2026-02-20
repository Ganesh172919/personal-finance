import { HttpError } from "../../middleware/httpError";
import type { ToolCallInput } from "../../schemas/v1/toolSchemas";

import { builtinToolHandlers } from "./builtins";
import type { ToolCatalogEntry, ToolCatalogRole } from "../toolCatalog";
import type { ToolActorRole, ToolHandler } from "./types";

const roleRank: Record<ToolCatalogRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const registry = new Map<string, ToolHandler>();
const builtinTools = new Set<string>();

for (const handler of builtinToolHandlers) {
  builtinTools.add(handler.tool);
  registry.set(handler.tool, handler);
}

export const listToolCatalog = (): ToolCatalogEntry[] => {
  return Array.from(registry.values()).map((handler) => handler.catalog);
};

export const getToolHandler = (tool: ToolCallInput["tool"]): ToolHandler => {
  const handler = registry.get(String(tool));
  if (!handler) {
    throw new HttpError(400, "TOOL_UNSUPPORTED", "Unsupported tool call");
  }
  return handler;
};

export const enforceToolRole = (params: {
  actorRole: ToolActorRole;
  requiredRole: ToolCatalogRole;
}) => {
  if (roleRank[params.actorRole] < roleRank[params.requiredRole]) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", `${params.requiredRole} role required`);
  }
};

export const registerTool = (handler: ToolHandler) => {
  if (builtinTools.has(handler.tool)) {
    throw new Error(`Cannot override builtin tool: ${handler.tool}`);
  }
  if (registry.has(handler.tool)) {
    throw new Error(`Tool already registered: ${handler.tool}`);
  }
  registry.set(handler.tool, handler);
};

export const upsertTool = (handler: ToolHandler) => {
  if (builtinTools.has(handler.tool)) {
    throw new Error(`Cannot override builtin tool: ${handler.tool}`);
  }
  registry.set(handler.tool, handler);
};

export const unregisterTool = (tool: string) => {
  const normalized = String(tool || "").trim();
  if (!normalized) {
    return false;
  }
  if (builtinTools.has(normalized)) {
    return false;
  }
  return registry.delete(normalized);
};
