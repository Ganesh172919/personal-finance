/**
 * @fileoverview Zod validation schemas for financial story sharing.
 *
 * Exported schemas:
 *   createFinancialStoryShareBodySchema - Validates creating a shareable financial story link
 *   shareTokenParamSchema               - Validates the :token route param for public share access
 *
 * Used by: v1Routes (POST /shares/financial-story), publicShareRoutes (GET /shares/financial-story/:token)
 *
 * Key validation rules:
 *   - Share creation:
 *     - expires_in_days: optional integer 1-365 for link expiration
 *     - include_goal_names, include_goal_deadlines, include_milestones: optional booleans controlling what data to share
 *     - max_milestones: optional integer 1-100 limiting milestone count
 *     - Defaults to empty object if no body provided
 *   - Share token: 16-256 chars, alphanumeric with _ and - allowed
 *   - Token schema uses regex to ensure URL-safe characters only
 */
import { z } from "zod";

const tokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid share token");

export const createFinancialStoryShareBodySchema = z
  .object({
    expires_in_days: z.number().int().min(1).max(365).optional(),
    include_goal_names: z.boolean().optional(),
    include_goal_deadlines: z.boolean().optional(),
    include_milestones: z.boolean().optional(),
    max_milestones: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .default({});

export const shareTokenParamSchema = z
  .object({
    token: tokenSchema,
  })
  .strict();
