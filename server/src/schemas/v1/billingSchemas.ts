import { z } from "zod";

export const billingCheckoutBodySchema = z
  .object({
    plan_tier: z.enum(["pro", "team"]),
    seats: z.number().int().positive().max(10_000).optional(),
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
  })
  .strict();

export const billingPortalQuerySchema = z
  .object({
    return_url: z.string().url().optional(),
  })
  .strict();

