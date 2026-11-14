/**
 * @fileoverview Shared Zod validation schemas used across multiple route modules.
 *
 * Exported schemas:
 *   objectIdSchema         - Validates a route param `:id` as a 24-character hex string (MongoDB ObjectId)
 *   fileIdParamSchema      - Validates a route param `:fileId` as a 24-character hex string
 *   userIdParamSchema      - Validates a route param `:userId` as a 24-character hex string
 *   sessionIdParamSchema   - Validates a route param `:sessionId` as a 24-character hex string
 *   paginationQuerySchema  - Validates pagination query params (page: positive int, limit: 1-100)
 *
 * Used by: financialDataRoutes, financialJournalRoutes, receiptRoutes, chatRoutes,
 *   fileRoutes, mediaRoutes, aiRoutes, v1Routes, and more
 *
 * Key validation rules:
 *   - All ID params must match the MongoDB ObjectId format: exactly 24 hex characters
 *   - Pagination: both fields optional, coerced to numbers, limit capped at 100
 */
import { z } from "zod";

// Validates route parameters containing a generic resource identifier.
// Enforces the standard 24-character hexadecimal MongoDB ObjectId string format.
// Rejects malformed identifiers before database retrieval operations occur.
export const objectIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id format")
});

// Validates route parameters specifying a stored GridFS or workspace file ID.
// Ensures incoming file identifier parameters match hexadecimal ObjectId formats.
// Protects file retrieval and download endpoints against malformed parameter inputs.
export const fileIdParamSchema = z.object({
  fileId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid fileId format")
});

// Validates route parameters specifying target user account identifiers.
// Restricts userId parameters strictly to valid 24-character hexadecimal strings.
// Used across user-specific administrative and data-access route definitions.
export const userIdParamSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid userId format")
});

// Validates route parameters specifying conversational chat session identifiers.
// Enforces standard 24-character hexadecimal ObjectId syntax on sessionId parameters.
// Ensures chat route handlers operate only on syntactically valid session IDs.
export const sessionIdParamSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid sessionId format")
});

// Validates standard query parameters for paginated collection endpoints.
// Coerces page numbers and bounds result limits up to a maximum of 100 items.
// Provides standardized pagination controls across various API route modules.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});
