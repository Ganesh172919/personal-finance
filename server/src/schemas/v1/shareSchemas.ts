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

// Validates URL-safe security tokens used for public resource sharing links.
// Restricts characters to alphanumeric, underscore, and dash symbols.
// Enforces token lengths between 16 and 256 characters to avoid weak credentials.
const tokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid share token");

// Validates payload attributes when generating a shareable financial summary story.
// Controls link expiration time horizons and selective visibility of goal milestones.
// Disallows unrecognized configuration options through strict schema enforcement.
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

// Validates route parameter objects containing a public share access token.
// Matches the token URL parameter against length and safe regex character criteria.
// Prevents invalid token inputs from performing database lookups on public shares.
export const shareTokenParamSchema = z
  .object({
    token: tokenSchema,
  })
  .strict();
