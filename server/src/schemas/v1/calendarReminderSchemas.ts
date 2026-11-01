/**
 * @fileoverview Zod validation schemas for calendar reminder management.
 *
 * Exported schemas:
 *   listCalendarRemindersQuerySchema - Validates query parameters for listing calendar reminders
 *   createCalendarReminderBodySchema - Validates body for creating a new reminder
 *   calendarReminderIdParamSchema    - Validates the :id route param as a valid ObjectId
 *
 * Used by: v1Routes (GET/POST/PATCH/DELETE /calendar-reminders)
 *
 * Key validation rules:
 *   - from/to: optional YYYY-MM-DD date strings for date range filtering
 *   - date: required YYYY-MM-DD format (create body)
 *   - title: required, 1-200 chars (create body)
 *   - description: optional, max 500 chars (create body)
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const listCalendarRemindersQuerySchema = z
  .object({
    from: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)")
      .optional(),
    to: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)")
      .optional(),
  })
  .strict();

export const createCalendarReminderBodySchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const calendarReminderIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
});
