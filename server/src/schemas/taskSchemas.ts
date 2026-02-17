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

export type TaskEffectInput = z.infer<typeof taskEffectSchema>;
