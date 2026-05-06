/**
 * @fileoverview Zod validation schemas for notification listing queries.
 *
 * Exported schemas:
 *   listNotificationsQuerySchema - Validates query parameters for listing user notifications
 *
 * Used by: v1Routes (GET /notifications)
 *
 * Key validation rules:
 *   - status: optional filter enum "unread" | "read"
 *   - limit: optional integer between 1 and 200
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const listNotificationsQuerySchema = z
  .object({
    status: z.enum(["unread", "read"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

