/**
 * @fileoverview Zod validation schemas for chat session and message endpoints.
 *
 * Exported schemas:
 *   sessionListQuerySchema   - Validates session list query (inherits pagination, strict mode)
 *   renameSessionBodySchema  - Validates session rename (title: required, 1-200 chars)
 *   getMessagesQuerySchema   - Validates message list query (inherits pagination, strict mode)
 *   sendMessageBodySchema    - Validates sending a chat message
 *
 * Used by: chatRoutes
 *
 * Key validation rules:
 *   - Message content: required, 1-4000 characters
 *   - fileIds: optional array of valid 24-char hex ObjectIds, max 10 files per message
 *   - options.narrative: optional boolean flag for AI response style
 *   - Session title: required, 1-200 characters
 *   - All schemas use .strict() to reject unknown fields
 */
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
