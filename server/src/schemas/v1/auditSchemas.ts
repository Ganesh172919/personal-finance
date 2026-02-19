import { z } from "zod";

export const listAuditEventsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    action: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

