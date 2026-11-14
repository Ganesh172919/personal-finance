/**
 * @fileoverview Zod validation schemas for financial journal entry updates,
 * offline stroke synchronization, and semantic vector search.
 *
 * Exported schemas:
 *   - patchJournalEntryBodySchema: Validates updating a journal entry's recognized text (max 5000 chars)
 *   - syncOfflineNotesBodySchema: Validates batch synchronization of offline client notes and strokes
 *   - semanticSearchQuerySchema: Validates semantic query string, cosine threshold, limit, and tag filter
 *
 * Used by: financialJournalRoutes
 */
import { z } from "zod";

// Validates partial update payloads modifying a financial journal entry.
// Enforces recognized text length bounds, optional categorization tags, and titles.
// Rejects unexpected properties to ensure consistent journal entry storage.
export const patchJournalEntryBodySchema = z
  .object({
    recognized_text: z.string().trim().max(5000),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
    title: z.string().trim().max(200).optional(),
  })
  .strict();

// Validates an individual offline client note item in a synchronization batch.
// Captures client-generated draft IDs, recognized text, raw strokes, and timestamps.
// Ensures consistent schema constraints on offline handwriting sync records.
export const syncOfflineNoteItemSchema = z
  .object({
    clientDraftId: z.string().trim().min(1).max(100),
    recognizedText: z.string().max(5000).optional().default(""),
    strokes: z.any().optional(),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
    title: z.string().trim().max(200).optional(),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

// Validates batch synchronization requests for offline journal notes and sketches.
// Enforces an array of note records bounded between 1 and 50 items per payload.
// Facilitates bulk offline-to-cloud sync while rejecting unknown top-level keys.
export const syncOfflineNotesBodySchema = z
  .object({
    notes: z.array(syncOfflineNoteItemSchema).min(1).max(50),
  })
  .strict();

// Validates query parameters for dense semantic vector search across journal entries.
// Enforces query text length, similarity threshold cutoffs, limits, and tag filters.
// Coerces query parameters to provide safe defaults for vector search execution.
export const semanticSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  threshold: z.coerce.number().min(0).max(1).optional().default(0.1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  tag: z.string().trim().max(50).optional(),
});
