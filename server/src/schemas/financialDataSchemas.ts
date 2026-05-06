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

export const transactionIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, "Invalid transaction id format")
});

export const goalIdParamSchema = z.object({
  goalId: z.string().regex(objectIdRegex, "Invalid goal id format")
});

export const debtIdParamSchema = z.object({
  debtId: z.string().regex(objectIdRegex, "Invalid debt id format")
});

export const createTransactionBodySchema = z
  .object({
    amount: z.number().positive(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    date: z.coerce.date().optional(),
    type: transactionTypeSchema
  })
  .strict();

const importTransactionRowSchema = z
  .object({
    amount: z.number().positive(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    date: z.coerce.date(),
    type: transactionTypeSchema
  })
  .strict();

export const importTransactionsBodySchema = z
  .object({
    rows: z.array(importTransactionRowSchema).min(1).max(5000)
  })
  .strict();

export const updateTransactionBodySchema = z
  .object({
    amount: z.number().positive().optional(),
    category: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(250).optional(),
    date: z.coerce.date().optional(),
    type: transactionTypeSchema.optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, "Provide at least one field to update");

export const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    type: transactionTypeSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    needs_review: z.coerce.boolean().optional(),
    review_flag: z.enum(["uncategorized", "suspected_duplicate", "needs_merchant_match", "split_candidate", "recurring_candidate"]).optional(),
  })
  .strict()
  .refine(
    query =>
      !query.from || !query.to || new Date(query.from).getTime() <= new Date(query.to).getTime(),
    "from must be earlier than or equal to to"
  );

export const recentTransactionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional()
  })
  .strict();

export const dashboardSummaryQuerySchema = z.object({}).strict();

export const portfolioSummaryQuerySchema = z
  .object({
    months: z.coerce.number().int().positive().max(36).optional()
  })
  .strict();

export const transactionsSummaryQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    groupBy: z.enum(["month"]).optional(),
    topCategories: z.coerce.number().int().positive().max(20).optional()
  })
  .strict()
  .refine(
    query => new Date(query.from).getTime() <= new Date(query.to).getTime(),
    "from must be earlier than or equal to to"
  );

export const createGoalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    target: z.number().nonnegative(),
    current: z.number().nonnegative().default(0),
    deadline: z.string().trim().min(1).max(64),
    priority: z.number().int().positive().max(10)
  })
  .strict();

export const updateGoalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    target: z.number().nonnegative().optional(),
    current: z.number().nonnegative().optional(),
    deadline: z.string().trim().min(1).max(64).optional(),
    priority: z.number().int().positive().max(10).optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, "Provide at least one field to update");

export const createDebtBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    balance: z.number().nonnegative(),
    interest_rate: z.number().min(0).max(100),
    minimum_payment: z.number().nonnegative(),
    type: z.string().trim().min(1).max(60)
  })
  .strict();

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
