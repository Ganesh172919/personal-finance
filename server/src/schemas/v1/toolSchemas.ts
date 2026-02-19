import { z } from "zod";

import { createWorkflowBodySchema } from "./workflowSchemas";
import { createExportBodySchema } from "./exportSchemas";

const objectIdRegex = /^[a-f\d]{24}$/i;
const isoDateString = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

const toolRiskSchema = z.enum(["low", "medium", "high"]);

const baseToolCallSchema = z
  .object({
    id: z.string().trim().min(4).max(128),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(2000),
    requires_confirmation: z.boolean().default(true),
    risk: toolRiskSchema.default("low"),
  })
  .strict();

const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

const transactionsCreateToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("transactions.create"),
    args: z
      .object({
        amount: z.number().positive(),
        tx_type: transactionTypeSchema,
        category: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(250),
        date: isoDateString.optional(),
      })
      .strict(),
  })
  .strict();

const goalsUpsertToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("goals.createOrUpdate"),
    args: z
      .object({
        goal_id: z.string().regex(objectIdRegex, "Invalid goal_id").optional(),
        name: z.string().trim().min(1).max(120),
        target: z.number().nonnegative(),
        current: z.number().nonnegative().optional(),
        deadline: z.string().trim().min(1).max(64),
        priority: z.number().int().min(1).max(10).optional(),
      })
      .strict(),
  })
  .strict();

const debtsUpsertToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("debts.createOrUpdate"),
    args: z
      .object({
        debt_id: z.string().regex(objectIdRegex, "Invalid debt_id").optional(),
        name: z.string().trim().min(1).max(120),
        balance: z.number().nonnegative(),
        interest_rate: z.number().min(0).max(100),
        minimum_payment: z.number().nonnegative(),
        type: z.string().trim().min(1).max(60),
      })
      .strict(),
  })
  .strict();

const workflowsCreateToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("workflows.create"),
    args: createWorkflowBodySchema,
  })
  .strict();

const workflowsEnableToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("workflows.enable"),
    args: z
      .object({
        workflow_id: z.string().regex(objectIdRegex, "Invalid workflow_id"),
        enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();

const workflowsRunToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("workflows.run"),
    args: z
      .object({
        workflow_id: z.string().regex(objectIdRegex, "Invalid workflow_id"),
        idempotency_key: z.string().trim().min(8).max(128).optional(),
      })
      .strict(),
  })
  .strict();

const exportsCreateToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("exports.create"),
    args: createExportBodySchema,
  })
  .strict();

const notificationsSendEmailToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("notifications.sendEmail"),
    args: z
      .object({
        to: z.string().trim().email().optional(),
        subject: z.string().trim().min(2).max(160),
        message: z.string().trim().min(2).max(5000),
      })
      .strict(),
  })
  .strict();

export const toolCallSchema = z.discriminatedUnion("tool", [
  transactionsCreateToolSchema,
  goalsUpsertToolSchema,
  debtsUpsertToolSchema,
  workflowsCreateToolSchema,
  workflowsEnableToolSchema,
  workflowsRunToolSchema,
  exportsCreateToolSchema,
  notificationsSendEmailToolSchema,
]);

export type ToolCallInput = z.infer<typeof toolCallSchema>;

export const toolsSimulateBodySchema = z
  .object({
    tool_call: toolCallSchema,
  })
  .strict();

export const toolsExecuteBodySchema = z
  .object({
    tool_call: toolCallSchema,
    confirm: z.boolean().optional(),
    idempotency_key: z.string().trim().min(4).max(128).optional(),
  })
  .strict();

export const internalToolsBodySchema = z
  .object({
    org_id: z.string().regex(objectIdRegex, "Invalid org_id"),
    user_id: z.string().regex(objectIdRegex, "Invalid user_id"),
    tool_call: toolCallSchema,
    confirm: z.boolean().optional(),
    idempotency_key: z.string().trim().min(4).max(128).optional(),
  })
  .strict();

