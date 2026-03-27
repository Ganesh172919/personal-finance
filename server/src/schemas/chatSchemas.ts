import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const sessionListQuerySchema = paginationQuerySchema.strict();

export const renameSessionBodySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200)
  })
  .strict();

export const getMessagesQuerySchema = paginationQuerySchema.strict();

export const sendMessageBodySchema = z
  .object({
    content: z.string().trim().min(1, "Message content is required").max(4000),
    fileIds: z
      .array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid file id format"))
      .max(10)
      .optional(),
    options: z
      .object({
        narrative: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
