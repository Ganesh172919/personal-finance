/**
 * @fileoverview Zod validation schemas for financial journal entry updates.
 *
 * Exported schemas:
 *   patchJournalEntryBodySchema - Validates updating a journal entry's recognized text (max 5000 chars)
 *
 * Used by: financialJournalRoutes (PATCH /financial-journal/entries/:id)
 *
 * Key validation rules:
 *   - recognized_text: required, trimmed, max 5000 characters
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const patchJournalEntryBodySchema = z
  .object({
    recognized_text: z.string().trim().max(5000),
  })
  .strict();

