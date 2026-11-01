/**
 * @fileoverview Zod validation schemas for activity feed queries.
 *
 * Exported schemas:
 *   activityFeedQuerySchema - Validates query parameters for the activity feed
 *
 * Used by: v1Routes (GET /activity-feed)
 *
 * Key validation rules:
 *   - limit: optional integer 1-100 (default 30 in controller)
 *   - before: optional ISO 8601 date string for cursor-based pagination
 *   - event_type: optional event type filter string
 *   - user_id: optional ObjectId to filter by actor
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const activityFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    before: z.string().trim().min(1).max(40).optional(),
    event_type: z.string().trim().min(1).max(100).optional(),
    user_id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user_id").optional(),
  })
  .strict();
