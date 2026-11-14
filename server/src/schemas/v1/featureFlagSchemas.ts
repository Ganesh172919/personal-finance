/**
 * @fileoverview Zod validation schemas for feature flag management.
 *
 * Exported schemas:
 *   featureFlagKeyParamSchema      - Validates the :key route param (lowercase alphanumeric with . _ - : separators)
 *   listFeatureFlagsQuerySchema    - Validates listing query (key_prefix filter, enabled boolean filter)
 *   upsertFeatureFlagBodySchema    - Validates creating/updating a feature flag
 *
 * Used by: v1Routes (GET/PUT/DELETE /feature-flags/:key)
 *
 * Key validation rules:
 *   - key: 3-120 chars, must start/end with alphanumeric, allows . _ - : in the middle
 *   - enabled: required boolean
 *   - variant: optional 1-80 char string for A/B testing variants
 *   - rollout_percent: optional integer 0-100 for gradual rollout
 *   - metadata: optional arbitrary key-value object
 *   - Query filter: enabled string "true"/"false" transformed to boolean
 */
import { z } from "zod";

// Validates feature flag key parameter from the route URL.
// Enforces naming conventions with lowercase alphanumeric characters and standard delimiters.
// Guarantees consistent feature flag identification across environments.
export const featureFlagKeyParamSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid feature flag key"),
  })
  .strict();

// Validates search and filter query parameters when listing feature flags.
// Supports filtering by key namespace prefix and stringified boolean enabled state.
// Transforms input enabled strings into native boolean filter values.
export const listFeatureFlagsQuerySchema = z
  .object({
    key_prefix: z.string().trim().toLowerCase().min(1).max(120).optional(),
    enabled: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return value === "true";
      }),
  })
  .strict();

// Validates the request body for inserting or updating a feature flag.
// Enforces enabled status flag, optional variant tag, rollout percentage, and metadata object.
// Prevents unrecognized configuration fields from entering the feature flag store.
export const upsertFeatureFlagBodySchema = z
  .object({
    enabled: z.boolean(),
    variant: z.string().trim().min(1).max(80).optional(),
    rollout_percent: z.number().int().min(0).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
