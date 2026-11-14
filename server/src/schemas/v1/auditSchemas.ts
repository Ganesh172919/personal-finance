/**
 * @fileoverview Zod validation schemas for audit event listing queries.
 *
 * Exported schemas:
 *   listAuditEventsQuerySchema - Validates query parameters for listing audit events
 *
 * Used by: v1Routes (GET /audit/events)
 *
 * Key validation rules:
 *   - limit: optional, integer between 1 and 200
 *   - action: optional, 1-80 character string for filtering by action type
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

// Validates query parameters for listing organization audit trail logs.
// Supports filtering by specific audit action strings and coerces integer limits.
// Bounds result sets between 1 and 200 items using strict schema evaluation.
export const listAuditEventsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    action: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

