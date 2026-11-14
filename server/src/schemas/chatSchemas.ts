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

// Validates pagination query parameters for listing user chat sessions.
// Inherits standard limit and cursor pagination schemas in strict mode.
// Rejects unexpected query keys to prevent invalid database filters.
export const sessionListQuerySchema = paginationQuerySchema.strict();

// Validates request payloads modifying the display title of a chat session.
// Enforces a non-empty string bounded within a maximum of 200 characters.
// Rejects extraneous unknown request attributes using strict evaluation.
export const renameSessionBodySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200)
  })
  .strict();

// Validates pagination query parameters for retrieving conversation chat messages.
// Enforces strict adherence to standard pagination limit and cursor constraints.
// Prevents unrecognized query parameters from being processed by message controllers.
export const getMessagesQuerySchema = paginationQuerySchema.strict();

// Validates request payloads for sending a message in a conversation session.
// Enforces content length bounds, attachment file ID formats, and AI options.
// Supports regeneration references and cache-bypass flags for message retries.
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
        // Regenerate action: id of the AgentOutput being redone, and a flag to skip the response cache.
        regenerate_of: z.string().regex(/^[a-f\d]{24}$/i, "Invalid agent output id").optional(),
        bypass_cache: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
