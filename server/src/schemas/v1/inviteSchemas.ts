import { z } from "zod";

export const acceptOrgInviteBodySchema = z
  .object({
    token: z.string().trim().min(20).max(256),
  })
  .strict();

