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
