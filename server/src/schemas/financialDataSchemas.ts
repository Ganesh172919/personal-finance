/**
 * @fileoverview Zod validation schemas for financial data endpoints (transactions, goals, debts).
 *
 * Exported schemas:
 *   Params:
 *     transactionIdParamSchema  - Validates :id as a 24-char hex ObjectId
 *     goalIdParamSchema         - Validates :goalId as a 24-char hex ObjectId
 *     debtIdParamSchema         - Validates :debtId as a 24-char hex ObjectId
 *
 *   Transaction bodies:
 *     createTransactionBodySchema    - Validates new transaction (amount, category, description, date, type)
 *     importTransactionsBodySchema   - Validates bulk import (rows array, 1-5000 items)
 *     updateTransactionBodySchema    - Validates partial transaction update (at least one field required)
 *
 *   Transaction queries:
 *     listTransactionsQuerySchema    - Validates list query (pagination, date range, type, category, review flags)
 *     recentTransactionsQuerySchema  - Validates recent transactions query (limit: 1-50)
 *     dashboardSummaryQuerySchema    - Validates dashboard summary query (empty, strict)
 *     portfolioSummaryQuerySchema    - Validates portfolio summary query (months: 1-36)
 *     transactionsSummaryQuerySchema - Validates summary query (from/to dates, groupBy, topCategories)
 *
 *   Goal bodies:
 *     createGoalBodySchema  - Validates new goal (name, target, current, deadline, priority)
 *     updateGoalBodySchema  - Validates partial goal update (at least one field required)
 *
 *   Debt bodies:
 *     createDebtBodySchema  - Validates new debt (name, balance, interest_rate, minimum_payment, type)
 *     updateDebtBodySchema  - Validates partial debt update (at least one field required)
 *
 * Used by: financialDataRoutes
 *
 * Key validation rules:
 *   - Transaction type enum: income | expense | investment
 *   - Date range: from must be <= to (enforced by .refine)
 *   - Review flags: uncategorized | suspected_duplicate | needs_merchant_match | split_candidate | recurring_candidate
 *   - Interest rate: 0-100 range
 *   - Goal priority: 1-10 integer
 *   - All update schemas require at least one field (reject empty objects)
 *   - All schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;
const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

// Validates route parameters specifying a transaction by unique ID.
// Enforces standard 24-character hexadecimal MongoDB ObjectId syntax.
// Rejects malformed transaction identifiers before database query execution.
export const transactionIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, "Invalid transaction id format")
});

// Validates route parameters specifying a target savings goal identifier.
// Enforces 24-character hexadecimal ObjectId syntax on the goalId parameter.
// Prevents invalid goal parameter inputs across goal modification routes.
export const goalIdParamSchema = z.object({
  goalId: z.string().regex(objectIdRegex, "Invalid goal id format")
});

// Validates route parameters specifying a liability or debt record ID.
// Enforces standard 24-character hexadecimal ObjectId format constraints.
// Ensures debt retrieval and deletion endpoints receive valid identifiers.
export const debtIdParamSchema = z.object({
  debtId: z.string().regex(objectIdRegex, "Invalid debt id format")
});

// Validates an individual category allocation item within a transaction split.
// Enforces non-empty category names and positive allocation amounts.
// Used for multi-category transaction itemization and receipt breakdown.
export const transactionSplitItemSchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    amount: z.number().positive(),
  })
  .strict();

// Validates incoming HTTP payloads creating a single new transaction entry.
// Enforces positive amount, category, description, type, and optional split rows.
// Rejects unknown request fields using strict schema validation.
export const createTransactionBodySchema = z
  .object({
    amount: z.number().positive(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    date: z.coerce.date().optional(),
    type: transactionTypeSchema,
    splits: z.array(transactionSplitItemSchema).optional()
  })
  .strict();

// Validates a single transaction row in a bulk batch import payload.
// Requires positive monetary amount, non-empty description, category, and date.
// Ensures consistent schema conformance across imported transaction entries.
const importTransactionRowSchema = z
  .object({
    amount: z.number().positive(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    date: z.coerce.date(),
    type: transactionTypeSchema
  })
  .strict();

// Validates bulk transaction import arrays containing between 1 and 5000 records.
// Applies the row-level validation schema across every imported transaction entry.
// Guarantees atomic verification of large transaction batch uploads.
export const importTransactionsBodySchema = z
  .object({
    rows: z.array(importTransactionRowSchema).min(1).max(5000)
  })
  .strict();

// Validates partial update payloads targeting an existing financial transaction.
// Enforces that at least one valid mutable property is supplied in the request.
// Prevents empty update requests from causing redundant database write operations.
export const updateTransactionBodySchema = z
  .object({
    amount: z.number().positive().optional(),
    category: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(250).optional(),
    date: z.coerce.date().optional(),
    type: transactionTypeSchema.optional(),
    splits: z.array(transactionSplitItemSchema).optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, "Provide at least one field to update");

// Validates query parameters for filtering and paginating transaction records.
// Supports date range bounds, category filtering, review flags, and keyset cursors.
// Refines input to verify that the start date precedes or equals the end date.
export const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    type: transactionTypeSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    // z.coerce.boolean() turns the string "false" into true; parse query strings explicitly.
    needs_review: z
      .preprocess((v) => (typeof v === "string" ? (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v) : v), z.boolean())
      .optional(),
    review_flag: z.enum(["uncategorized", "suspected_duplicate", "needs_merchant_match", "split_candidate", "recurring_candidate"]).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
    // Opaque keyset cursor from a previous response (`pagination.next_cursor`); preferred over deep `page`.
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    query =>
      !query.from || !query.to || new Date(query.from).getTime() <= new Date(query.to).getTime(),
    "from must be earlier than or equal to to"
  );

// Validates query parameters requesting recent user transaction activities.
// Coerces and caps maximum returned record counts at 50 transactions.
// Allows optional currency conversion overrides for consistent UI display.
export const recentTransactionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates query parameters for fetching aggregated financial dashboard summaries.
// Enforces an empty object payload using strict mode to prevent unexpected query keys.
// Ensures clean endpoint consumption without extraneous parameter baggage.
export const dashboardSummaryQuerySchema = z.object({}).strict();

// Validates query parameters requesting portfolio and net worth summary metrics.
// Bounds historical horizon months between 1 and 36 for trend analysis.
// Supports withholding tax rate specifications and bilateral treaty country codes.
export const portfolioSummaryQuerySchema = z
  .object({
    months: z.coerce.number().int().positive().max(36).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
    wht_rate: z.coerce.number().min(0).max(100).optional(),
    treaty_country: z.string().trim().max(50).optional(),
  })
  .strict();

// Validates query parameters for aggregated transaction category summaries.
// Requires mandatory start and end timestamps and validates date chronological order.
// Supports monthly groupings and caps top-spending category counts at 20.
export const transactionsSummaryQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    groupBy: z.enum(["month"]).optional(),
    topCategories: z.coerce.number().int().positive().max(20).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict()
  .refine(
    query => new Date(query.from).getTime() <= new Date(query.to).getTime(),
    "from must be earlier than or equal to to"
  );

// Goal deadlines drive pacing math (months remaining, monthly need), so they must be
// real calendar dates. Accept YYYY-MM-DD optionally followed by an ISO time part.
// Validates target deadline dates assigned to financial savings goals.
// Enforces standard YYYY-MM-DD calendar syntax with optional ISO timestamps.
// Ensures deadlines parse to real dates required for pacing calculations.
const goalDeadlineSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    value => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) && !Number.isNaN(Date.parse(value)),
    "Deadline must be a valid date (YYYY-MM-DD)"
  );

// Validates incoming HTTP request payloads creating a new financial savings goal.
// Enforces non-negative monetary target and current amounts, deadlines, and priorities.
// Rejects unexpected properties using strict object schema validation.
export const createGoalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    target: z.number().nonnegative(),
    current: z.number().nonnegative().default(0),
    deadline: goalDeadlineSchema,
    priority: z.number().int().positive().max(10)
  })
  .strict();

// Validates partial update payloads for modifying an existing savings goal.
// Requires at least one mutable field such as target, deadline, or priority.
// Rejects empty update requests to avoid unnecessary database operations.
export const updateGoalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    target: z.number().nonnegative().optional(),
    current: z.number().nonnegative().optional(),
    deadline: goalDeadlineSchema.optional(),
    priority: z.number().int().positive().max(10).optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, "Provide at least one field to update");

// Validates request payloads creating a new debt or liability record.
// Enforces non-negative balances, percentage interest rates, and minimum payments.
// Rejects unknown properties using strict object schema validation.
export const createDebtBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    balance: z.number().nonnegative(),
    interest_rate: z.number().min(0).max(100),
    minimum_payment: z.number().nonnegative(),
    type: z.string().trim().min(1).max(60)
  })
  .strict();

// Validates partial update payloads modifying an existing debt record.
// Requires at least one valid mutable liability field to be provided.
// Prevents empty update requests from executing redundant database updates.
export const updateDebtBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    balance: z.number().nonnegative().optional(),
    interest_rate: z.number().min(0).max(100).optional(),
    minimum_payment: z.number().nonnegative().optional(),
    type: z.string().trim().min(1).max(60).optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, "Provide at least one field to update");

// Validates query parameters for retrieving merchant embedding cluster groupings.
// Filters clusters by minimum transaction occurrences and caps query limits at 100.
// Supports currency filtering for multi-currency transaction cluster lookups.
export const getMerchantClustersQuerySchema = z
  .object({
    min_count: z.coerce.number().int().min(1).max(50).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]).optional(),
  })
  .strict();

// Validates request payloads applying category normalization to merchant clusters.
// Binds cluster keys and normalized merchant names across up to 200 transaction IDs.
// Ensures bulk merchant categorization updates receive validated payload structures.
export const applyMerchantClusterBodySchema = z
  .object({
    cluster_key: z.string().trim().min(1).max(120),
    normalized_name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(120),
    transaction_ids: z.array(z.string().trim().min(1)).min(1).max(200),
  })
  .strict();

// Validates incoming webhook event payloads dispatched by bank sync aggregators.
// Supports transaction, item, and auth webhook event types with transaction arrays.
// Enforces structural integrity on third-party banking integration data feeds.
export const bankFeedWebhookBodySchema = z
  .object({
    webhook_type: z.enum(["TRANSACTIONS", "ITEM", "AUTH"]).default("TRANSACTIONS"),
    webhook_code: z.string().trim().min(1).max(80),
    item_id: z.string().trim().optional(),
    account_id: z.string().trim().optional(),
    transactions: z
      .array(
        z.object({
          transaction_id: z.string().trim().min(1).max(120),
          account_id: z.string().trim().optional(),
          amount: z.number(),
          date: z.string().trim().min(1),
          name: z.string().trim().min(1).max(200),
          category: z.array(z.string().trim()).optional(),
          pending: z.boolean().optional(),
          iso_currency_code: z.string().trim().max(10).optional(),
        })
      )
      .min(1)
      .max(500),
  })
  .strict();
