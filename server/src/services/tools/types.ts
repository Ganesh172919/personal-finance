import type mongoose from "mongoose";

import type { ToolCallInput } from "../../schemas/v1/toolSchemas";
import type { MutationSource } from "../../types/provenance";
import type { ToolCatalogEntry, ToolCatalogRole } from "../toolCatalog";

// Defines the authorized tenant role of the actor invoking an AI tool.
// Re-exports the catalog role definitions for member, admin, or owner.
// Governs role-based authorization boundaries during tool execution.
export type ToolActorRole = ToolCatalogRole;

// Contextual parameters provided during a dry-run AI tool simulation.
// Identifies organization, user, caller permissions, and tool call payload.
// Allows simulation handlers to compute previews without persisting changes.
export type ToolSimulationContext = {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actorRole: ToolActorRole;
  toolCall: ToolCallInput;
  requestId?: string;
};

// Contextual execution parameters supplied during active tool execution.
// Extends simulation context with mutation provenance audit information.
// Links persisted ledger mutations directly to the driving AI tool request.
export type ToolExecutionContext = ToolSimulationContext & {
  source: MutationSource;
};

// Interface defining the simulation and execution contract for an AI tool.
// Encapsulates the tool key, catalog metadata, and minimum required role.
// Provides simulate for dry-run previews and execute for committing changes.
export type ToolHandler = {
  tool: ToolCallInput["tool"];
  catalog: ToolCatalogEntry;
  requiredRole: ToolCatalogRole;
  simulate: (ctx: ToolSimulationContext) => Promise<Record<string, unknown>>;
  execute: (ctx: ToolExecutionContext) => Promise<Record<string, unknown>>;
};

