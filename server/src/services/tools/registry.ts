import { HttpError } from "../../middleware/httpError";
import type { ToolCallInput } from "../../schemas/v1/toolSchemas";

import { builtinToolHandlers } from "./builtins";
import type { ToolCatalogEntry, ToolCatalogRole } from "../toolCatalog";
import type { ToolActorRole, ToolHandler } from "./types";

// Defines numerical precedence ranking weights for organizational user roles.
// Establishes hierarchy from standard members up to organizational owners.
// Used for comparing caller permissions against tool authorization floors.
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

// Lists all registered tool catalog entries available for AI invocation.
// Extracts catalog definitions from active handlers stored in the registry map.
// Supplies registered tool schemas and risk metadata to client callers.
export const listToolCatalog = (): ToolCatalogEntry[] => {
  return Array.from(registry.values()).map((handler) => handler.catalog);
};

// Resolves the execution handler mapped to a specified tool name string.
// Retrieves registered handlers from memory or throws a 400 HttpError.
// Ensures incoming tool invocations correspond to supported capabilities.
export const getToolHandler = (tool: ToolCallInput["tool"]): ToolHandler => {
  const handler = registry.get(String(tool));
  if (!handler) {
    throw new HttpError(400, "TOOL_UNSUPPORTED", "Unsupported tool call");
  }
  return handler;
};

// Verifies whether an actor's assigned role meets or exceeds required thresholds.
// Compares numeric role ranks between caller roles and minimum requirements.
// Throws a 403 HttpError when caller permissions are insufficient for execution.
export const enforceToolRole = (params: {
  actorRole: ToolActorRole;
  requiredRole: ToolCatalogRole;
}) => {
  if (roleRank[params.actorRole] < roleRank[params.requiredRole]) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", `${params.requiredRole} role required`);
  }
};

// Registers a dynamic tool handler into the active runtime tool registry.
// Protects builtin core tools from being overwritten by external extensions.
// Prevents duplicate registrations by enforcing key uniqueness in the map.
export const registerTool = (handler: ToolHandler) => {
  if (builtinTools.has(handler.tool)) {
    throw new Error(`Cannot override builtin tool: ${handler.tool}`);
  }
  if (registry.has(handler.tool)) {
    throw new Error(`Tool already registered: ${handler.tool}`);
  }
  registry.set(handler.tool, handler);
};

// Registers or updates an existing non-builtin tool handler in the registry.
// Refuses replacement attempts targeting protected builtin system tools.
// Allows dynamic tool extensions and plugins to update their implementations.
export const upsertTool = (handler: ToolHandler) => {
  if (builtinTools.has(handler.tool)) {
    throw new Error(`Cannot override builtin tool: ${handler.tool}`);
  }
  registry.set(handler.tool, handler);
};

// Removes a dynamically registered tool handler from the active registry.
// Prohibits the deregistration or removal of essential builtin tool handlers.
// Returns true when a tool was successfully removed, or false otherwise.
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
