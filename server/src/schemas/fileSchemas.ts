/**
 * @fileoverview Zod validation schemas for workspace file management endpoints.
 *
 * Exported schemas:
 *   listWorkspaceFilesQuerySchema   - Validates file list query (extends pagination with optional search, max 120 chars)
 *   analyzeWorkspaceFileBodySchema  - Validates file analysis request (optional prompt, 1-2000 chars)
 *
 * Used by: fileRoutes (GET /, POST /:id/analyze)
 *
 * Key validation rules:
 *   - Inherits pagination from common (page, limit)
 *   - Search: optional, trimmed, max 120 characters
 *   - Prompt: optional, 1-2000 characters when provided
 *   - Both schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

import { paginationQuerySchema } from "./common";

export const listWorkspaceFilesQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(120).optional(),
  })
  .strict();

export const analyzeWorkspaceFileBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
