import { z } from "zod";

export const analyticsOverviewQuerySchema = z
  .object({
    period_key: z.string().trim().regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)").optional(),
  })
  .strict();
