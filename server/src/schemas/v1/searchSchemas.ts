/**
 * @fileoverview Zod validation schemas for global search queries.
 *
 * Exported schemas:
 *   globalSearchQuerySchema - Validates global search query parameters
 *
 * Used by: v1Routes (GET /search)
 *
 * Key validation rules:
 *   - q: required search query string, 1-200 characters
 *   - types: optional comma-separated list of entity types to search, transformed into an array
 *   - limit: optional integer 1-100 for result count
 *   - cursor: optional cursor string for pagination (opaque token)
 */
import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined)),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
});
