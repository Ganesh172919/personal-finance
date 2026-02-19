import type mongoose from "mongoose";

import type { ToolCallInput } from "../../schemas/v1/toolSchemas";
import type { MutationSource } from "../../types/provenance";
import type { ToolCatalogEntry, ToolCatalogRole } from "../toolCatalog";

export type ToolActorRole = ToolCatalogRole;

export type ToolSimulationContext = {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actorRole: ToolActorRole;
  toolCall: ToolCallInput;
  requestId?: string;
};

export type ToolExecutionContext = ToolSimulationContext & {
  source: MutationSource;
};

export type ToolHandler = {
  tool: ToolCallInput["tool"];
  catalog: ToolCatalogEntry;
  requiredRole: ToolCatalogRole;
  simulate: (ctx: ToolSimulationContext) => Promise<Record<string, unknown>>;
  execute: (ctx: ToolExecutionContext) => Promise<Record<string, unknown>>;
};

