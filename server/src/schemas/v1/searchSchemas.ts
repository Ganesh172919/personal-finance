import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined)),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
});
