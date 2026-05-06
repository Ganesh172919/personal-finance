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

export const objectIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id format")
});

export const fileIdParamSchema = z.object({
  fileId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid fileId format")
});

export const userIdParamSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid userId format")
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid sessionId format")
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});
