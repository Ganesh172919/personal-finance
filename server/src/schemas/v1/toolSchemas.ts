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

// Regular expression pattern validating 24-character hexadecimal MongoDB ObjectIds.
// Used across tool invocation arguments to ensure entity IDs adhere to valid database formats.
// Case-insensitively tests for 24 hex characters.
const objectIdRegex = /^[a-f\d]{24}$/i;
// Validates trimmed ISO date strings provided in tool execution arguments.
// Enforces string bounds and checks parseability as a valid calendar timestamp.
// Prevents malformed date strings from entering tool handler business logic.
const isoDateString = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

// Enumerates execution risk levels associated with automated agent tool calls.
// Classifies tool operations into low, medium, or high operational risk.
// Informs user prompt and confirmation requirements prior to executing actions.
const toolRiskSchema = z.enum(["low", "medium", "high"]);

// Base schema establishing standard metadata required on all tool invocations.
// Validates call identifier, human-readable title, and explanatory description.
// Sets default confirmation requirements and defaults risk rating to low.
const baseToolCallSchema = z
  .object({
    id: z.string().trim().min(4).max(128),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(2000),
    requires_confirmation: z.boolean().default(true),
    risk: toolRiskSchema.default("low"),
  })
  .strict();

// Enumerates permitted transaction category types for transaction-creation tools.
// Restricts category types strictly to income, expense, or investment.
// Ensures transactions dispatched from tools map to allowed ledger types.
const transactionTypeSchema = z.enum(["income", "expense", "investment"]);

// Schema validating tool calls targeting financial transaction creation.
// Enforces positive transaction amount, transaction type, category, and narrative description.
// Includes optional ISO date string to support backdated transaction entries.
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

// Schema validating tool calls for creating or updating financial saving goals.
// Validates goal target amounts, current saved progress, deadline string, and priority rank.
// Supports updating existing goals when optional goal_id is supplied.
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

// Schema validating tool calls for recording or updating liability and debt items.
// Checks outstanding balance, APR percentage rate, minimum payments, and debt type.
// Validates optional debt_id parameter for targeting existing liability records.
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

// Schema validating tool calls that construct automated workflow definitions.
// Delegates workflow argument validation directly to createWorkflowBodySchema.
// Ensures tool-initiated workflows meet identical rules as direct API requests.
const workflowsCreateToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("workflows.create"),
    args: createWorkflowBodySchema,
  })
  .strict();

// Schema validating tool calls targeting workflow activation or deactivation.
// Requires valid workflow ObjectId and a boolean flag reflecting desired status.
// Prevents malformed workflow identifiers from executing activation toggles.
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

// Schema validating tool calls triggering immediate execution of an automated workflow.
// Requires workflow ObjectId and supports optional idempotency tokens.
// Prevents duplicate immediate runs when idempotency key is provided.
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

// Schema validating tool calls initiating asynchronous data exports.
// Inherits structure and constraints defined in createExportBodySchema.
// Supports requesting transactions CSVs and monthly financial summary PDFs.
const exportsCreateToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("exports.create"),
    args: createExportBodySchema,
  })
  .strict();

// Schema validating tool calls dispatching email notifications.
// Enforces valid email format for recipient, subject string limits, and message body.
// Ensures transactional emails originating from tools have complete message parameters.
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

// Schema validating omni-channel notification tool requests across email and in-app feeds.
// Enforces delivery channel constraints and user identification parameters.
// Performs cross-field validation to reject external email targets on in-app channels.
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

// Common argument schema for tool lookups searching accounts, merchants, or rules.
// Enforces trimmed non-empty search query string and optional result limit up to 50.
// Guarantees consistent search argument structures across financial lookup tools.
const financeLookupBaseArgsSchema = z
  .object({
    q: z.string().trim().min(1).max(160),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

// Tool call schema for finding finance accounts matching fuzzy query strings.
// Specializes base tool call with literal tool name finance.lookupAccount.
// Employs base search arguments to discover existing account records.
const financeLookupAccountToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupAccount"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

// Tool call schema for finding merchant profiles matching query text.
// Specializes base tool call with literal tool name finance.lookupMerchant.
// Accepts query strings to look up merchant IDs and historical categories.
const financeLookupMerchantToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupMerchant"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

// Tool call schema for finding existing recurring expense or income rules.
// Specializes base tool call with literal tool identifier finance.lookupRecurringRule.
// Supports finding recurring rules by name to inspect recurrence schedules.
const financeLookupRecurringRuleToolSchema = baseToolCallSchema
  .extend({
    tool: z.literal("finance.lookupRecurringRule"),
    args: financeLookupBaseArgsSchema,
  })
  .strict();

// Tool call schema for triggering detection of recurring transaction candidates.
// Validates analysis parameters including days of history, max results, and recurrence count.
// Passes detection bounds to automated recurring pattern inference workers.
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

// Tool call schema for generating intelligent budget allocation recommendations.
// Validates target monthly period, historical analysis window, buffer percentages, and minimum thresholds.
// Supports excluding specific spending categories from recommendation models.
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

// Tool call schema for executing end-of-month financial reconciliation and closing.
// Validates period key, optional automated export generation flag, and category limits.
// Triggers monthly close workflows for ledger calculation and snapshot persistence.
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

// Discriminated union uniting all built-in tool call schemas keyed on the tool literal identifier.
// Validates argument payloads against their respective tool schema definitions.
// Serves as the primary validation gate for native core tools.
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

// Schema validating custom plugin tool invocations.
// Enforces that plugin tool names begin with the standard "plugin." prefix.
// Allows arbitrary argument dictionaries defined by plugin manifests.
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

// Top-level union schema validating any permissible tool call structure.
// Combines built-in system tools and dynamic third-party plugin tools.
// Ensures uniform shape for tool requests originating from AI planners.
export const toolCallSchema = z.union([builtinToolCallSchema, pluginToolCallSchema]);

// Inferred TypeScript interface for any valid tool call payload.
// Used across tool execution services to enforce static typing on tool parameters.
// Guarantees type-safety between AI model tool output and execution dispatchers.
export type ToolCallInput = z.infer<typeof toolCallSchema>;

// Validates request payload when running a dry-run tool simulation.
// Requires a valid tool call object to predict outcomes without applying mutations.
// Disallows superfluous payload properties to keep simulation contracts strict.
export const toolsSimulateBodySchema = z
  .object({
    tool_call: toolCallSchema,
  })
  .strict();

// Validates request payload when executing real-effect tool mutations.
// Supports user confirmation flags and idempotency keys to prevent duplicate execution.
// Strictly checks tool arguments against defined schema specifications.
export const toolsExecuteBodySchema = z
  .object({
    tool_call: toolCallSchema,
    confirm: z.boolean().optional(),
    idempotency_key: z.string().trim().min(4).max(128).optional(),
  })
  .strict();

// Validates internal tool dispatch payloads originating from the AI Core service.
// Injects explicit organization and user context IDs along with tool call structures.
// Provides authorization boundaries when internal automation invokes tools on user behalf.
export const internalToolsBodySchema = z
  .object({
    org_id: z.string().regex(objectIdRegex, "Invalid org_id"),
    user_id: z.string().regex(objectIdRegex, "Invalid user_id"),
    tool_call: toolCallSchema,
    confirm: z.boolean().optional(),
    idempotency_key: z.string().trim().min(4).max(128).optional(),
  })
  .strict();
