/**
 * @fileoverview Zod validation schemas for Unified Context Retrieval.
 *
 * Validates queries across:
 * - User Memory Facts (MemoryRecordModel)
 * - Workspace Knowledge Chunks (WorkspaceKnowledgeChunkModel)
 * - Ledger Transactions (TransactionModel)
 *
 * Exported schemas:
 *   unifiedContextQuerySchema - GET query validation
 *   unifiedContextBodySchema  - POST body validation
 */

import { z } from "zod";

// Defines permitted data source partitions for multi-source unified context retrieval.
// Validates whether search requests target user memories, workspace files, or transactions.
// Restricts downstream search indexes strictly to supported persistence layers.
const allowedSourcesEnum = z.enum(["memory", "file", "transaction"]);

// Validates URL query parameters for GET requests to the unified context retrieval endpoint.
// Parses comma-separated source lists and enforces bounded integer limits and score thresholds.
// Ensures incoming search queries have well-defined retrieval bounds and filters.
export const unifiedContextQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  sources: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is "memory" | "file" | "transaction" =>
          s === "memory" || s === "file" || s === "transaction"
        );
    }),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  minScore: z.coerce.number().min(0).max(100).default(0),
});

// Validates JSON request bodies for POST requests to the unified context retrieval endpoint.
// Accepts structured query text, target source arrays, pagination bounds, and score filters.
// Provides structured input validation for multi-domain semantic retrieval dispatch.
export const unifiedContextBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  sources: z.array(allowedSourcesEnum).optional(),
  limit: z.number().int().min(1).max(50).default(15).optional(),
  minScore: z.number().min(0).max(100).default(0).optional(),
});
