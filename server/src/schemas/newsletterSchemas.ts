/**
 * @fileoverview Zod validation schemas for newsletter API endpoints.
 *
 * Exported schemas:
 *   updateNewsletterPreferencesBodySchema - Validates preference update body
 *   newsletterHistoryQuerySchema          - Validates history query pagination
 *   unsubscribeTokenParamSchema           - Validates unsubscribe token param
 *
 * Used by: newsletterRoutes
 *
 * Key validation rules:
 *   - deliveryTime: must match HH:mm format
 *   - timezone: 1-50 characters
 *   - limit: integer 1-50, default 10
 *   - offset: integer >= 0, default 0
 *   - unsubscribe token: must be valid UUID
 *   - All schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

// Validates request payloads modifying personal newsletter subscription preferences.
// Controls subscription status, HH:mm delivery time, timezone, and topic toggles.
// Enforces strict schema constraints to keep preference configurations sanitized.
export const updateNewsletterPreferencesBodySchema = z
  .object({
    isSubscribed: z.boolean().optional(),
    deliveryTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    timezone: z.string().min(1).max(50).optional(),
    contentPreferences: z
      .object({
        spendingSummary: z.boolean().optional(),
        budgetAlerts: z.boolean().optional(),
        upcomingBills: z.boolean().optional(),
        financialTips: z.boolean().optional(),
        portfolioNews: z.boolean().optional(),
        weeklyHealthScore: z.boolean().optional(),
        actionableRecommendations: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

// Validates pagination query parameters for listing previously dispatched newsletters.
// Coerces and bounds integer limits up to 50 items and enforces non-negative offsets.
// Supplies safe defaults when pagination attributes are omitted in client queries.
export const newsletterHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

// Validates route parameters specifying a newsletter one-click unsubscribe token.
// Enforces valid UUID string format syntax on the incoming token parameter.
// Protects public unsubscribe handler endpoints against malformed parameter inputs.
export const unsubscribeTokenParamSchema = z
  .object({
    token: z.string().uuid("Invalid unsubscribe token"),
  })
  .strict();
