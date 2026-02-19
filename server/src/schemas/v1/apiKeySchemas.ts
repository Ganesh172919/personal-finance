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

