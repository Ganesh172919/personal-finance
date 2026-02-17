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
