import { z } from "zod";

export const featureFlagKeyParamSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid feature flag key"),
  })
  .strict();

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

export const upsertFeatureFlagBodySchema = z
  .object({
    enabled: z.boolean(),
    variant: z.string().trim().min(1).max(80).optional(),
    rollout_percent: z.number().int().min(0).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
