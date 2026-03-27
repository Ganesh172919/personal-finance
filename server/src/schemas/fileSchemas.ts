import { z } from "zod";

import { paginationQuerySchema } from "./common";

export const listWorkspaceFilesQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(120).optional(),
  })
  .strict();

export const analyzeWorkspaceFileBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
