import { z } from "zod";

export const emitAutomationEventBodySchema = z
  .object({
    event_type: z.string().trim().min(2).max(120),
    aggregate_type: z.string().trim().min(2).max(120).optional(),
    aggregate_id: z.string().trim().min(2).max(200).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
