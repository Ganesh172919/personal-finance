/**
 * @fileoverview Zod validation schemas for API key creation.
 *
 * Exported schemas:
 *   createApiKeyBodySchema - Validates creating a new API key for an organization
 *
 * Used by: v1Routes (POST /api-keys)
 *
 * Key validation rules:
 *   - name: required, 2-120 characters
 *   - scopes: required array of permission scopes, 1-20 items
 *     Allowed scopes: usage:read, workflows:read, workflows:write, transactions:read, transactions:write
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const createApiKeyBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    scopes: z
      .array(
        z.enum([
          "usage:read",
          "workflows:read",
          "workflows:write",
          "transactions:read",
          "transactions:write",
        ])
      )
      .min(1)
      .max(20),
  })
  .strict();

