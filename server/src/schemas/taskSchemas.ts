/**
 * @fileoverview Zod validation schemas for AI-generated financial task management.
 *
 * Exported schemas:
 *   taskIdParamSchema        - Validates task ID route param (8-128 chars, trimmed)
 *   tasksFromPlanBodySchema  - Validates creating tasks from an AI plan (optional source refs + full plan)
 *   listTasksQuerySchema     - Validates task list query (status filter + limit)
 *   taskEffectSchema         - Discriminated union of task side effects:
 *       - transaction: create a transaction (amount, category, description, date, tx_type)
 *       - goal_progress: update goal progress (goal_id, amount, mode)
 *       - debt_payment: record debt payment (debt_id, amount)
 *       - profile_update: update financial profile fields
 *   updateTaskBodySchema     - Validates task status update (status, effects, completion evidence)
 *   applyTaskBodySchema      - Validates applying/executing a task's effects
 *
 * Exported types:
 *   TaskEffectInput - Inferred type from taskEffectSchema
 *
 * Used by: taskRoutes
 *
 * Key validation rules:
 *   - Task status enum: open | completed | dismissed
 *   - Effects array: max 20 items, each a discriminated union on "type"
 *   - Transaction effects: amount must be positive, date optional
 *   - Goal progress: mode enum increment | set (default increment)
 *   - Apply body supports idempotency_key for safe retries
 *   - planSchema imported from aiPlanSchema for plan validation
 */
import { z } from "zod";
import { planSchema } from "./aiPlanSchema";

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectIdString = z.string().regex(objectIdRegex, "Invalid id format");
const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

export const taskIdParamSchema = z
  .object({
    id: z.string().trim().min(8).max(128)
  })
  .strict();

export const tasksFromPlanBodySchema = z
  .object({
    source: z
      .object({
        agentOutputId: objectIdString.optional(),
        chatMessageId: objectIdString.optional(),
        requestId: z.string().trim().min(1).max(128).optional()
      })
      .strict()
      .optional(),
    plan: planSchema
  })
  .strict();

export const recurrenceCadenceSchema = z.enum([
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export const recurrenceSchema = z
  .object({
    cadence: recurrenceCadenceSchema.default("none"),
    nextDueDate: z.coerce.date().optional(),
    parentTaskId: z.string().trim().max(64).optional(),
    generation: z.number().int().min(1).default(1).optional(),
  })
  .strict();

export const createTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    why: z.string().trim().min(1).max(500),
    steps: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
    priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
    expected_impact: z.string().trim().max(300).optional(),
    kind: z.enum(["cashflow", "budget", "debt", "invest", "goal", "education", "generic"]).optional(),
    bucket: z.union([z.literal(7), z.literal(30), z.literal(365)]).optional().default(30),
    due_days: z.number().int().positive().max(3650).optional(),
    dueDate: z.coerce.date().optional(),
    recurrence: recurrenceSchema.optional(),
  })
  .strict();

export const listTasksQuerySchema = z
  .object({
    status: z.enum(["open", "completed", "dismissed"]).optional().default("open"),
    limit: z.coerce.number().int().positive().max(100).optional().default(50)
  })
  .strict();

const transactionEffectSchema = z
  .object({
    type: z.literal("transaction"),
    transaction: z
      .object({
        amount: z.number().positive(),
        category: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(250),
        date: z.coerce.date().optional(),
        tx_type: transactionTypeSchema,
      })
      .strict(),
  })
  .strict();

const goalProgressEffectSchema = z
  .object({
    type: z.literal("goal_progress"),
    goal_id: objectIdString,
    amount: z.number().nonnegative(),
    mode: z.enum(["increment", "set"]).optional().default("increment"),
  })
  .strict();

const debtPaymentEffectSchema = z
  .object({
    type: z.literal("debt_payment"),
    debt_id: objectIdString,
    amount: z.number().positive(),
  })
  .strict();

const profileUpdateEffectSchema = z
  .object({
    type: z.literal("profile_update"),
    updates: z
      .object({
        annual_income: z.number().nonnegative().optional(),
        monthly_expenses: z.number().nonnegative().optional(),
        savings: z.number().optional(),
      })
      .strict()
      .refine(body => Object.keys(body).length > 0, "Provide at least one profile field"),
  })
  .strict();

export const taskEffectSchema = z.discriminatedUnion("type", [
  transactionEffectSchema,
  goalProgressEffectSchema,
  debtPaymentEffectSchema,
  profileUpdateEffectSchema,
]);

export const updateTaskBodySchema = z
  .object({
    status: z.enum(["open", "completed", "dismissed"]),
    completed_at: z.coerce.date().optional(),
    note: z.string().trim().max(1000).optional(),
    effects: z.array(taskEffectSchema).max(20).optional(),
    completion_evidence: z
      .object({
        note: z.string().trim().max(1000).optional(),
        completed_at: z.coerce.date().optional(),
      })
      .strict()
      .optional(),
    apply_status: z.enum(["pending", "succeeded", "failed"]).optional(),
    apply_error_code: z.string().trim().max(80).optional(),
    recurrence: recurrenceSchema.optional(),
  })
  .strict();

export const applyTaskBodySchema = z
  .object({
    status: z.literal("completed").optional().default("completed"),
    idempotency_key: z.string().trim().min(8).max(128).optional(),
    completed_at: z.coerce.date().optional(),
    note: z.string().trim().max(1000).optional(),
    effects: z.array(taskEffectSchema).max(20).optional().default([]),
  })
  .strict();

export const taskWebhookTokenParamSchema = z
  .object({
    token: z.string().trim().min(16).max(128),
  })
  .strict();

export const inboundTaskWebhookBodySchema = z
  .object({
    action: z.enum(["create", "complete"]).optional().default("create"),
    title: z.string().trim().min(1).max(200).optional(),
    why: z.string().trim().max(500).optional(),
    steps: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
    priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
    expected_impact: z.string().trim().max(300).optional(),
    kind: z.enum(["cashflow", "budget", "debt", "invest", "goal", "education", "generic"]).optional(),
    bucket: z.union([z.literal(7), z.literal(30), z.literal(365)]).optional().default(30),
    due_days: z.number().int().positive().max(3650).optional(),
    dueDate: z.coerce.date().optional(),
    recurrence: recurrenceSchema.optional(),
    taskId: z.string().trim().max(128).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .passthrough();

export const dispatchTasksWebhookBodySchema = z
  .object({
    target: z.enum(["generic", "linear", "todoist", "jira", "slack"]).default("generic"),
    webhook_url: z.string().url("Valid webhook URL required"),
    task_ids: z.array(z.string().trim().min(8).max(128)).min(1).max(100),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type TaskEffectInput = z.infer<typeof taskEffectSchema>;
