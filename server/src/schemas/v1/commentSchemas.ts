/**
 * @fileoverview Zod validation schemas for the commenting system.
 *
 * Exported schemas:
 *   listCommentsQuerySchema  - Validates query params for listing comments (resource_type + resource_id)
 *   createCommentBodySchema  - Validates body for creating a new comment
 *   updateCommentBodySchema  - Validates body for updating an existing comment
 *   commentIdParamSchema     - Validates the :id route param as a valid ObjectId
 *
 * Used by: v1Routes (GET/POST/PATCH/DELETE /comments)
 *
 * Key validation rules:
 *   - resource_type: required enum (transaction, budget, goal, workflow, insight)
 *   - resource_id: required string, 1-200 chars
 *   - text: required, 1-2000 chars
 *   - mentions: optional array of strings, max 20 items
 *   - parent_id: optional ObjectId for threaded replies
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

const VALID_RESOURCE_TYPES = ["transaction", "budget", "goal", "workflow", "insight"] as const;

// Validates query parameters for retrieving comment threads on a resource.
// Restricts queries by target entity type and specific entity resource identifier.
// Enforces strict schema constraints to keep comment retrieval queries sanitized.
export const listCommentsQuerySchema = z
  .object({
    resource_type: z.enum(VALID_RESOURCE_TYPES),
    resource_id: z.string().trim().min(1).max(200),
  })
  .strict();

// Validates request payloads creating a new collaborative resource comment.
// Enforces valid entity types, text length bounds, user mentions, and parent thread IDs.
// Rejects unexpected properties using strict object schema validation.
export const createCommentBodySchema = z
  .object({
    resource_type: z.enum(VALID_RESOURCE_TYPES),
    resource_id: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(2000),
    mentions: z.array(z.string().trim().min(1)).max(20).optional(),
    parent_id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid parent_id").optional(),
  })
  .strict();

// Validates request payloads modifying the text content of an existing comment.
// Enforces trimmed string lengths bounded between 1 and 2000 characters.
// Rejects unknown request attributes using strict schema evaluation.
export const updateCommentBodySchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
  })
  .strict();

// Validates route parameters specifying a comment by its unique MongoDB ObjectId.
// Enforces standard 24-character hexadecimal ObjectId syntax for the ID param.
// Ensures comment management endpoints operate exclusively on valid identifier keys.
export const commentIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
});
