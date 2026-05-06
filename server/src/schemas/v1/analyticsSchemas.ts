/**
 * @fileoverview Zod validation schemas for analytics overview queries.
 *
 * Exported schemas:
 *   analyticsOverviewQuerySchema - Validates analytics overview query parameters
 *
 * Used by: v1Routes (GET /analytics/overview)
 *
 * Key validation rules:
 *   - period_key: optional, must match YYYY-MM format (e.g., "2026-01")
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const analyticsOverviewQuerySchema = z
  .object({
    period_key: z.string().trim().regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)").optional(),
  })
  .strict();
