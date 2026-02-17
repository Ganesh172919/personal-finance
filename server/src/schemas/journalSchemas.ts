import { z } from "zod";

export const patchJournalEntryBodySchema = z
  .object({
    recognized_text: z.string().trim().max(5000),
  })
  .strict();

