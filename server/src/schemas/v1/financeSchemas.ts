/**
 * @fileoverview Zod validation schemas for core finance domain entities (accounts, merchants,
 * budgets, and recurring rules).
 *
 * Exported schemas:
 *   Shared:
 *     currencyCodeSchema          - Validates ISO 4217 currency codes (3 uppercase letters, e.g., "USD")
 *     periodKeySchema             - Validates period keys in YYYY-MM format
 *     periodKeyParamSchema        - Validates :periodKey route param
 *     accountTypeSchema           - Enum: checking | savings | credit | brokerage | cash
 *
 *   Accounts:
 *     createAccountBodySchema     - Validates creating a finance account (name, institution, type, currency, etc.)
 *     updateAccountBodySchema     - Validates updating an account (all fields optional)
 *
 *   Merchants:
 *     listMerchantsQuerySchema    - Validates merchant search query (q, limit)
 *     upsertMerchantBodySchema    - Validates creating/updating a merchant (name, category_default, aliases)
 *
 *   Budgets:
 *     budgetAllocationUpsertBodySchema  - Validates upserting a budget allocation (category, amount, currency)
 *     listBudgetAllocationsQuerySchema  - Validates listing allocations query (limit)
 *
 *   Recurring Rules:
 *     recurringRuleIdParamSchema        - Validates :id route param
 *     createRecurringRuleBodySchema     - Validates creating a recurring rule (name, cron, status, etc.)
 *     updateRecurringRuleBodySchema     - Validates updating a recurring rule (partial of create + status)
 *
 * Used by: v1Routes (finance/accounts, finance/merchants, finance/budgets, finance/recurring)
 *
 * Key validation rules:
 *   - Currency codes: exactly 3 uppercase letters (ISO 4217)
 *   - Period keys: YYYY-MM format (e.g., "2026-01")
 *   - Account types: checking | savings | credit | brokerage | cash
 *   - Merchant aliases: up to 50 alternative names for matching
 *   - Budget allocations: amount is non-negative (can be 0 for clearing)
 *   - Recurring rules: cron expression 5-120 chars, status active | disabled
 *   - Recurring rules support merchant_id (ObjectId) or merchant_name (string) lookup
 */
import { z } from "zod";

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Invalid currency code");

export const periodKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Invalid period key (expected YYYY-MM)");

export const periodKeyParamSchema = z
  .object({
    periodKey: periodKeySchema,
  })
  .strict();

export const accountTypeSchema = z.enum(["checking", "savings", "credit", "brokerage", "cash"]);

export const createAccountBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    institution: z.string().trim().min(1).max(120).optional(),
    type: accountTypeSchema.default("checking"),
    currency: currencyCodeSchema.default("USD"),
    mask: z.string().trim().min(2).max(16).optional(),
    opening_balance: z.number().optional(),
    last_statement_balance: z.number().optional(),
    last_statement_date: z.coerce.date().optional(),
    last_reconciled_at: z.coerce.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const updateAccountBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    institution: z.string().trim().min(1).max(120).optional(),
    type: accountTypeSchema.optional(),
    currency: currencyCodeSchema.optional(),
    mask: z.string().trim().min(2).max(16).optional(),
    opening_balance: z.number().optional(),
    last_statement_balance: z.number().nullable().optional(),
    last_statement_date: z.coerce.date().optional(),
    last_reconciled_at: z.coerce.date().optional(),
    status: z.enum(["active", "closed"]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listMerchantsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

export const upsertMerchantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category_default: z.string().trim().min(1).max(100).optional(),
    aliases: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const budgetAllocationUpsertBodySchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    amount: z.coerce.number().min(0),
    currency: currencyCodeSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listBudgetAllocationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

export const recurringRuleIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id format"),
  })
  .strict();

export const createRecurringRuleBodySchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    cron: z.string().trim().min(5).max(120),
    status: z.enum(["active", "disabled"]).default("active"),
    merchant_id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    merchant_name: z.string().trim().min(1).max(160).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    amount_min: z.coerce.number().min(0).optional(),
    amount_max: z.coerce.number().min(0).optional(),
    next_run_at: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const updateRecurringRuleBodySchema = createRecurringRuleBodySchema
  .partial()
  .extend({
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();
