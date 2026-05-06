/**
 * @fileoverview Zod validation schemas for receipt parsing and confirmation.
 *
 * Exported schemas:
 *   receiptParseBodySchema    - Validates optional hints for OCR parsing (lang, currencyHint)
 *   receiptConfirmBodySchema  - Validates confirmed/corrected receipt data before saving
 *
 * Used by: receiptRoutes (POST /receipts/parse, POST /receipts/:id/confirm)
 *
 * Key validation rules:
 *   - Parse body: both fields optional (language hint max 20 chars, currency hint max 10 chars)
 *   - Confirm body: vendor (required, max 250), date (YYYY-MM-DD format), total (positive),
 *     tax (non-negative, optional), currency (optional), category (required, max 100),
 *     description (optional), items array (each with description, optional quantity/unit_price/total)
 */
import { z } from "zod";

export const receiptParseBodySchema = z.object({
  lang: z.string().trim().min(1).max(20).optional(),
  currencyHint: z.string().trim().min(1).max(10).optional(),
});

export const receiptConfirmBodySchema = z.object({
  vendor: z.string().trim().min(1).max(250),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date"),
  total: z.number().finite().positive(),
  tax: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(250).optional(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(250),
        quantity: z.number().finite().positive().optional(),
        unit_price: z.number().finite().nonnegative().optional(),
        total: z.number().finite().nonnegative().optional(),
      })
    )
    .optional(),
});

