/**
 * @fileoverview Zod validation schemas for usage ledger queries.
 *
 * Exported schemas:
 *   usageLedgerQuerySchema - Validates query parameters for viewing the usage ledger
 *
 * Used by: v1Routes (GET /usage/ledger)
 *
 * Key validation rules:
 *   - period_key: optional, must match YYYY-MM format (e.g., "2026-01")
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const usageLedgerQuerySchema = z
  .object({
    period_key: z.string().trim().regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)").optional(),
  })
  .strict();

