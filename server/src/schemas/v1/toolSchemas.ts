/**
 * @fileoverview Zod validation schemas for the tool execution system (AI-driven actions).
 *
 * Exported schemas:
 *   toolCallSchema            - Union of all supported tool call types (builtin + plugin)
 *   toolsSimulateBodySchema   - Validates simulating a tool call (dry-run)
 *   toolsExecuteBodySchema    - Validates executing a tool call with real effects
 *   internalToolsBodySchema   - Validates internal tool calls (used by AI Core, includes org_id + user_id)
 *
 * Exported types:
 *   ToolCallInput - Inferred TypeScript type from toolCallSchema
 *
 * Built-in tool types (discriminated on "tool" field):
 *   transactions.create           - Create a transaction
 *   goals.createOrUpdate          - Create or update a financial goal
 *   debts.createOrUpdate          - Create or update a debt entry
 *   workflows.create              - Create a workflow
 *   workflows.enable/disable      - Toggle workflow enabled state
 *   workflows.run                 - Trigger a workflow execution
 *   exports.create                - Create a data export
 *   notifications.sendEmail       - Send an email notification
 *   notifications.send            - Send notification via any channel (email, in_app)
 *   finance.lookupAccount         - Search for an account by name
 *   finance.lookupMerchant        - Search for a merchant by name
 *   finance.lookupRecurringRule   - Search for a recurring rule
 *   finance.detectRecurringCandidates - Detect recurring transaction patterns
 *   budgets.recommendAllocations  - AI-recommended budget allocations
 *   closeMonth.run                - Run month-end close process
 *
 * Used by: v1Routes (POST /tools/simulate, /tools/execute), internalToolsRoutes (POST /simulate, /execute)
 *
 * Key validation rules:
 *   - Each tool call requires: id (4-128), title (2-160), description (2-2000)
 *   - requires_confirmation: defaults to true (safety for destructive actions)
 *   - risk: enum low | medium | high (default low)
 *   - Plugin tools must have tool name starting with "plugin."
 *   - notifications.send: cross-field validation prevents "to" when channel=in_app
 *   - budgets.recommendAllocations: supports category exclusion list and buffer percentage
 */
import { z } from "zod";

import { createWorkflowBodySchema } from "./workflowSchemas";
import { createExportBodySchema } from "./exportSchemas";
import { currencyCodeSchema, periodKeySchema } from "./financeSchemas";

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

const notificationsSendToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("notifications.send"),
    args: z
      .object({
        channel: z.enum(["email", "in_app"]),
        to: z.string().trim().email().optional(),
        user_id: z.string().regex(objectIdRegex, "Invalid user_id").optional(),
        subject: z.string().trim().min(2).max(160),
        message: z.string().trim().min(2).max(5000),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.channel === "in_app" && value.to) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "to is not allowed when channel=in_app",
            path: ["to"],
          });
        }
      }),
  })
  .strict();

const financeLookupBaseArgsSchema = z
  .object({
    q: z.string().trim().min(1).max(160),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const financeLookupAccountToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupAccount"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

const financeLookupMerchantToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupMerchant"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

const financeLookupRecurringRuleToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupRecurringRule"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

const financeDetectRecurringCandidatesToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.detectRecurringCandidates"),
    args: z
      .object({
        days_back: z.number().int().min(30).max(730).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        min_occurrences: z.number().int().min(3).max(24).optional(),
      })
      .strict(),
  })
  .strict();

const budgetsRecommendAllocationsToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("budgets.recommendAllocations"),
    args: z
      .object({
        period_key: periodKeySchema,
        days_back: z.number().int().min(30).max(730).optional(),
        top_categories: z.number().int().min(1).max(100).optional(),
        buffer_pct: z.number().min(0).max(50).optional(),
        min_amount: z.number().min(0).optional(),
        currency: currencyCodeSchema.optional(),
        exclude_categories: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
      })
      .strict(),
  })
  .strict();

const closeMonthRunToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("closeMonth.run"),
    args: z
      .object({
        period_key: periodKeySchema,
        include_export: z.boolean().optional(),
        top_categories: z.number().int().min(0).max(50).optional(),
      })
      .strict(),
  })
  .strict();

const builtinToolCallSchema = z.discriminatedUnion("tool", [
  transactionsCreateToolSchema,
  goalsUpsertToolSchema,
  debtsUpsertToolSchema,
  workflowsCreateToolSchema,
  workflowsEnableToolSchema,
  workflowsRunToolSchema,
  exportsCreateToolSchema,
  notificationsSendEmailToolSchema,
  notificationsSendToolSchema,
  financeLookupAccountToolSchema,
  financeLookupMerchantToolSchema,
  financeLookupRecurringRuleToolSchema,
  financeDetectRecurringCandidatesToolSchema,
  budgetsRecommendAllocationsToolSchema,
  closeMonthRunToolSchema,
]);

const pluginToolCallSchema = baseToolCallSchema
  .extend({
    tool: z
      .string()
      .trim()
      .min(8)
      .max(200)
      .refine((value) => value.startsWith("plugin."), "Invalid plugin tool name"),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const toolCallSchema = z.union([builtinToolCallSchema, pluginToolCallSchema]);

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
