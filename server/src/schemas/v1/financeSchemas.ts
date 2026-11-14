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
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

// Validates standard 3-letter uppercase ISO 4217 currency codes.
// Enforces trimmed three-character alphabetic format (e.g., USD, EUR).
// Rejects malformed or lower-case currency identifiers across finance models.
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Invalid currency code");

// Validates calendar period keys formatted as four-digit year and two-digit month.
// Restricts month values strictly between 01 and 12 to eliminate invalid calendar dates.
// Prevents out-of-range period representations from producing forecast service errors.
export const periodKeySchema = z
  .string()
  .trim()
  // Month must be 01-12: "2026-13" used to pass and then 500 in the forecast service.
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid period key (expected YYYY-MM)");

// Validates route parameter objects containing a periodKey property.
// Wraps the standardized period key format schema into a strict parameter object.
// Ensures incoming route segments adhere strictly to valid year-month strings.
export const periodKeyParamSchema = z
  .object({
    periodKey: periodKeySchema,
  })
  .strict();

// Enumerates permissible financial account classifications within the application.
// Restricts account types to checking, savings, credit, brokerage, or cash accounts.
// Enforces uniform category labels across balance and ledger accounting workflows.
export const accountTypeSchema = z.enum(["checking", "savings", "credit", "brokerage", "cash"]);

// Validates incoming payload data for instantiating a new user financial account.
// Enforces account name, optional institution, default account type, and currency.
// Checks optional opening balances, reconciliation timestamps, and metadata records.
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

// Validates payload attributes when modifying an existing financial account.
// Permits partial updates while maintaining validation bounds for all fields.
// Allows updating active or closed status and clearing statement balances safely.
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

// Validates search and pagination query parameters for merchant directories.
// Supports substring query matching across merchant names with safe string limits.
// Bounds result sets between 1 and 500 records to maintain endpoint responsiveness.
export const listMerchantsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

// Validates payload attributes for creating or modifying merchant definitions.
// Checks merchant naming length and optional default transaction categorization.
// Enforces alias array constraints up to 50 distinct recognized merchant name variations.
export const upsertMerchantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category_default: z.string().trim().min(1).max(100).optional(),
    aliases: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// Validates budget allocation details when establishing monthly envelope targets.
// Enforces target spending category, non-negative monetary amounts, and currency.
// Rejects unallowed properties to maintain data consistency in budget records.
export const budgetAllocationUpsertBodySchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    amount: z.coerce.number().min(0),
    currency: currencyCodeSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// Validates query parameters when retrieving list of budget allocations.
// Restricts result size limits to prevent oversized responses up to 500 items.
// Permits filtering budget allocations against supported international currency codes.
export const listBudgetAllocationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates path parameters identifying a specific budget allocation record.
// Enforces valid year-month period key formatting alongside a 24-char ObjectId.
// Guarantees consistent path parameter validation for allocation management routes.
export const budgetAllocationIdParamSchema = z
  .object({
    periodKey: periodKeySchema,
    id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id format"),
  })
  .strict();

// Validates parameter objects containing a single recurring rule identifier.
// Enforces strict 24-character hexadecimal MongoDB ObjectId string formatting.
// Prevents malformed identifiers from triggering downstream database exceptions.
export const recurringRuleIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id format"),
  })
  .strict();

// Tests whether a provided string represents a syntactically valid cron schedule.
// Attempts to parse the expression with CronExpressionParser and catches failures.
// Returns a boolean indicating cron validity for schema refinement verification.
const isParsableCron = (value: string) => {
  try {
    CronExpressionParser.parse(value);
    return true;
  } catch {
    return false;
  }
};

// Base schema encapsulating attributes common to recurring transaction rules.
// Enforces descriptive rule names, valid cron expressions, and rule status flags.
// Validates optional merchant references, monetary range limits, and next run times.
const recurringRuleBodyBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    cron: z.string().trim().min(5).max(120).refine(isParsableCron, "Invalid cron expression"),
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

// Verifies that recurring rule monetary thresholds maintain logical order.
// Ensures that amount_min is not greater than amount_max when both are defined.
// Prevents impossible amount bounds in automated recurring transaction detection.
const amountRangeIsOrdered = (body: { amount_min?: number; amount_max?: number }) =>
  body.amount_min === undefined || body.amount_max === undefined || body.amount_min <= body.amount_max;

// Validates the creation payload for establishing new recurring transaction rules.
// Extends the base recurring rule schema with ordered amount threshold constraints.
// Ensures newly created recurring rules have valid schedules and numeric intervals.
export const createRecurringRuleBodySchema = recurringRuleBodyBaseSchema.refine(amountRangeIsOrdered, {
  message: "amount_min must be less than or equal to amount_max",
  path: ["amount_max"],
});

// Validates payload attributes when updating existing recurring transaction rules.
// Converts base rule properties into optional fields to support partial modifications.
// Enforces strict schema constraints preventing arbitrary properties on updates.
export const updateRecurringRuleBodySchema = recurringRuleBodyBaseSchema
  .partial()
  .extend({
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

// Validates request payload for rebalancing funds across budget category envelopes.
// Checks array of transfer objects specifying source and destination categories.
// Enforces positive transfer amounts and bounds total batch transfers between 1 and 50.
export const rebalanceBudgetAllocationsBodySchema = z
  .object({
    transfers: z
      .array(
        z.object({
          from_category: z.string().trim().min(1).max(100),
          to_category: z.string().trim().min(1).max(100),
          amount: z.coerce.number().positive().max(1000000),
          reason: z.string().trim().max(200).optional(),
        })
      )
      .min(1)
      .max(50),
  })
  .strict();

