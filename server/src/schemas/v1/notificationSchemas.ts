import { z } from "zod";

export const listNotificationsQuerySchema = z
  .object({
    status: z.enum(["unread", "read"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

