import type { UsageFeature } from "../models/usageEventModel";

export type ToolCatalogRole = "member" | "admin" | "owner";

export type ToolCatalogEntitlement = {
  feature: UsageFeature;
  units?: number;
};

export type ToolCatalogEntry = {
  tool: string;
  title: string;
  description: string;
  risk_default: "low" | "medium" | "high";
  requires_confirmation_default: boolean;
  required_role: ToolCatalogRole;
  required_entitlement?: ToolCatalogEntitlement;
  args_schema: Record<string, unknown>;
  args_example: Record<string, unknown>;
};

const objectIdSchema = { type: "string", pattern: "^[a-f\\d]{24}$" };

const toolArgsSchemas = {
  transactions_create: {
    type: "object",
    additionalProperties: false,
    required: ["amount", "tx_type", "category", "description"],
    properties: {
      amount: { type: "number", exclusiveMinimum: 0 },
      tx_type: { type: "string", enum: ["income", "expense", "investment"] },
      category: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", minLength: 1, maxLength: 250 },
      date: { type: "string", description: "ISO date string" },
    },
  },
  goals_upsert: {
    type: "object",
    additionalProperties: false,
    required: ["name", "target", "deadline"],
    properties: {
      goal_id: { ...objectIdSchema, description: "Existing goal id to update (optional)" },
      name: { type: "string", minLength: 1, maxLength: 120 },
      target: { type: "number", minimum: 0 },
      current: { type: "number", minimum: 0 },
      deadline: { type: "string", minLength: 1, maxLength: 64 },
      priority: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  debts_upsert: {
    type: "object",
    additionalProperties: false,
    required: ["name", "balance", "interest_rate", "minimum_payment", "type"],
    properties: {
      debt_id: { ...objectIdSchema, description: "Existing debt id to update (optional)" },
      name: { type: "string", minLength: 1, maxLength: 120 },
      balance: { type: "number", minimum: 0 },
      interest_rate: { type: "number", minimum: 0, maximum: 100 },
      minimum_payment: { type: "number", minimum: 0 },
      type: { type: "string", minLength: 1, maxLength: 60 },
    },
  },
  workflows_create: {
    type: "object",
    additionalProperties: false,
    required: ["name", "trigger", "actions"],
    properties: {
      name: { type: "string", minLength: 2, maxLength: 160 },
      enabled: { type: "boolean" },
      trigger: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: { const: "manual" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "cron"],
            properties: {
              type: { const: "cron" },
              cron: { type: "string", minLength: 5, maxLength: 120 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "event_type"],
            properties: {
              type: { const: "event" },
              event_type: { type: "string", minLength: 2, maxLength: 120 },
            },
          },
        ],
      },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "bucket", "title", "why", "expected_impact"],
              properties: {
                type: { const: "create_task" },
                bucket: { type: "integer", enum: [7, 30, 365] },
                title: { type: "string", minLength: 2, maxLength: 160 },
                why: { type: "string", minLength: 2, maxLength: 600 },
                steps: { type: "array", items: { type: "string" }, maxItems: 20 },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                expected_impact: { type: "string", minLength: 2, maxLength: 600 },
                kind: {
                  type: "string",
                  enum: ["cashflow", "budget", "debt", "invest", "goal", "education", "generic"],
                },
                due_days: { type: "integer", minimum: 1, maximum: 3650 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "channel", "subject", "message"],
              properties: {
                type: { const: "send_notification" },
                channel: { type: "string", enum: ["email", "in_app"] },
                subject: { type: "string", minLength: 2, maxLength: 160 },
                message: { type: "string", minLength: 2, maxLength: 2000 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "export_type"],
              properties: {
                type: { const: "export_report" },
                export_type: { type: "string", enum: ["transactions_csv", "monthly_summary_pdf"] },
                params: { type: "object", additionalProperties: true },
              },
              allOf: [
                {
                  if: {
                    properties: { export_type: { const: "monthly_summary_pdf" } },
                    required: ["export_type"],
                  },
                  then: {
                    required: ["params"],
                    properties: {
                      params: {
                        type: "object",
                        additionalProperties: true,
                        required: ["period_key"],
                        properties: {
                          period_key: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  },
  workflows_enable: {
    type: "object",
    additionalProperties: false,
    required: ["workflow_id", "enabled"],
    properties: {
      workflow_id: objectIdSchema,
      enabled: { type: "boolean" },
    },
  },
  workflows_run: {
    type: "object",
    additionalProperties: false,
    required: ["workflow_id"],
    properties: {
      workflow_id: objectIdSchema,
      idempotency_key: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  exports_create: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { const: "transactions_csv" },
          params: {
            type: "object",
            additionalProperties: false,
            properties: {
              date_from: { type: "string", description: "ISO date string" },
              date_to: { type: "string", description: "ISO date string" },
              tx_type: { type: "string", enum: ["income", "expense", "investment"] },
              category: { type: "string", minLength: 1, maxLength: 100 },
            },
          },
          idempotency_key: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["type", "params"],
        properties: {
          type: { const: "monthly_summary_pdf" },
          params: {
            type: "object",
            additionalProperties: false,
            required: ["period_key"],
            properties: {
              period_key: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            },
          },
          idempotency_key: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
    ],
  },
  notifications_send_email: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "message"],
    properties: {
      to: { type: "string", format: "email" },
      subject: { type: "string", minLength: 2, maxLength: 160 },
      message: { type: "string", minLength: 2, maxLength: 5000 },
    },
  },
  notifications_send: {
    type: "object",
    additionalProperties: false,
    required: ["channel", "subject", "message"],
    properties: {
      channel: { type: "string", enum: ["email", "in_app"] },
      to: { type: "string", format: "email" },
      user_id: objectIdSchema,
      subject: { type: "string", minLength: 2, maxLength: 160 },
      message: { type: "string", minLength: 2, maxLength: 5000 },
    },
  },
  finance_lookup_account: {
    type: "object",
    additionalProperties: false,
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1, maxLength: 160 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  finance_lookup_merchant: {
    type: "object",
    additionalProperties: false,
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1, maxLength: 160 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  finance_lookup_recurring_rule: {
    type: "object",
    additionalProperties: false,
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1, maxLength: 160 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  finance_detect_recurring_candidates: {
    type: "object",
    additionalProperties: false,
    properties: {
      days_back: { type: "integer", minimum: 30, maximum: 730 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      min_occurrences: { type: "integer", minimum: 3, maximum: 24 },
    },
  },
  budgets_recommend_allocations: {
    type: "object",
    additionalProperties: false,
    required: ["period_key"],
    properties: {
      period_key: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
      days_back: { type: "integer", minimum: 30, maximum: 730 },
      top_categories: { type: "integer", minimum: 1, maximum: 100 },
      buffer_pct: { type: "number", minimum: 0, maximum: 50 },
      min_amount: { type: "number", minimum: 0 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      exclude_categories: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 100 },
        maxItems: 50,
      },
    },
  },
  close_month_run: {
    type: "object",
    additionalProperties: false,
    required: ["period_key"],
    properties: {
      period_key: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
      include_export: { type: "boolean" },
      top_categories: { type: "integer", minimum: 0, maximum: 50 },
    },
  },
} as const;

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    tool: "transactions.create",
    title: "Create transaction",
    description: "Create a single income/expense/investment transaction.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "member",
    args_schema: toolArgsSchemas.transactions_create,
    args_example: {
      amount: 24.99,
      tx_type: "expense",
      category: "Dining Out",
      description: "Lunch",
      date: new Date().toISOString(),
    },
  },
  {
    tool: "goals.createOrUpdate",
    title: "Create or update goal",
    description: "Upsert a financial goal in the active profile.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "member",
    args_schema: toolArgsSchemas.goals_upsert,
    args_example: {
      name: "Emergency fund",
      target: 6000,
      current: 1200,
      deadline: "2026-12-31",
      priority: 5,
    },
  },
  {
    tool: "debts.createOrUpdate",
    title: "Create or update debt",
    description: "Upsert a debt item in the active profile.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "member",
    args_schema: toolArgsSchemas.debts_upsert,
    args_example: {
      name: "Credit card",
      balance: 2400,
      interest_rate: 19.99,
      minimum_payment: 70,
      type: "credit_card",
    },
  },
  {
    tool: "workflows.create",
    title: "Create workflow",
    description: "Create an automation workflow for the active organization.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "admin",
    args_schema: toolArgsSchemas.workflows_create,
    args_example: {
      name: "Weekly money check-in",
      enabled: true,
      trigger: { type: "cron", cron: "0 9 * * 1" },
      actions: [
        {
          type: "create_task",
          bucket: 7,
          title: "Weekly money check-in",
          why: "Build a lightweight review habit.",
          steps: ["Review last week transactions", "Adjust one category cap"],
          priority: "medium",
          expected_impact: "Improves consistency.",
          kind: "cashflow",
          due_days: 7,
        },
      ],
    },
  },
  {
    tool: "workflows.enable",
    title: "Enable or disable workflow",
    description: "Toggle workflow enabled flag.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "admin",
    args_schema: toolArgsSchemas.workflows_enable,
    args_example: {
      workflow_id: "0123456789abcdef01234567",
      enabled: true,
    },
  },
  {
    tool: "workflows.run",
    title: "Run workflow",
    description: "Trigger a workflow run (queued when worker is available).",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "admin",
    args_schema: toolArgsSchemas.workflows_run,
    args_example: {
      workflow_id: "0123456789abcdef01234567",
      idempotency_key: "run_0123456789abcdef",
    },
  },
  {
    tool: "exports.create",
    title: "Create export",
    description: "Generate an export artifact for transactions or monthly summary.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "member",
    required_entitlement: { feature: "export_access", units: 1 },
    args_schema: toolArgsSchemas.exports_create as unknown as Record<string, unknown>,
    args_example: {
      type: "transactions_csv",
      params: { date_from: "2026-01-01", date_to: "2026-02-01" },
      idempotency_key: "export_0123456789abcdef",
    },
  },
  {
    tool: "notifications.sendEmail",
    title: "Send email",
    description: "Send an email notification (local dev may use console mode).",
    risk_default: "medium",
    requires_confirmation_default: true,
    required_role: "member",
    args_schema: toolArgsSchemas.notifications_send_email,
    args_example: {
      subject: "Personal Finance reminder",
      message: "Review your spending this week.",
    },
  },
  {
    tool: "notifications.send",
    title: "Send notification",
    description: "Send a notification via email or in-app message.",
    risk_default: "medium",
    requires_confirmation_default: true,
    required_role: "member",
    args_schema: toolArgsSchemas.notifications_send,
    args_example: {
      channel: "in_app",
      subject: "Personal Finance update",
      message: "You have new autopilot actions ready to review.",
    },
  },
  {
    tool: "finance.lookupAccount",
    title: "Lookup account",
    description: "Search accounts by name, institution, or mask for use in other tool calls.",
    risk_default: "low",
    requires_confirmation_default: false,
    required_role: "member",
    args_schema: toolArgsSchemas.finance_lookup_account,
    args_example: {
      q: "Chase",
      limit: 5,
    },
  },
  {
    tool: "finance.lookupMerchant",
    title: "Lookup merchant",
    description: "Search merchants by name or alias for use in categorization and recurring rules.",
    risk_default: "low",
    requires_confirmation_default: false,
    required_role: "member",
    args_schema: toolArgsSchemas.finance_lookup_merchant,
    args_example: {
      q: "Netflix",
      limit: 5,
    },
  },
  {
    tool: "finance.lookupRecurringRule",
    title: "Lookup recurring rule",
    description: "Search recurring rules by name, merchant, or category.",
    risk_default: "low",
    requires_confirmation_default: false,
    required_role: "member",
    args_schema: toolArgsSchemas.finance_lookup_recurring_rule,
    args_example: {
      q: "rent",
      limit: 10,
    },
  },
  {
    tool: "finance.detectRecurringCandidates",
    title: "Detect recurring candidates",
    description: "Detect recurring expense candidates from transaction history (deterministic).",
    risk_default: "low",
    requires_confirmation_default: false,
    required_role: "member",
    args_schema: toolArgsSchemas.finance_detect_recurring_candidates,
    args_example: {
      days_back: 365,
      limit: 20,
      min_occurrences: 3,
    },
  },
  {
    tool: "budgets.recommendAllocations",
    title: "Recommend budget allocations",
    description: "Generate suggested envelope allocations from recent spending and optionally apply them.",
    risk_default: "low",
    requires_confirmation_default: true,
    required_role: "admin",
    args_schema: toolArgsSchemas.budgets_recommend_allocations,
    args_example: {
      period_key: "2026-02",
      days_back: 90,
      top_categories: 12,
      buffer_pct: 10,
      currency: "USD",
    },
  },
  {
    tool: "closeMonth.run",
    title: "Close the month",
    description: "Create a month-close snapshot and optionally generate the monthly summary PDF export.",
    risk_default: "medium",
    requires_confirmation_default: true,
    required_role: "admin",
    required_entitlement: { feature: "export_access", units: 1 },
    args_schema: toolArgsSchemas.close_month_run,
    args_example: {
      period_key: "2026-02",
      include_export: true,
      top_categories: 10,
    },
  },
];

export const TOOL_CATALOG_BY_TOOL: Record<string, ToolCatalogEntry> = Object.fromEntries(
  TOOL_CATALOG.map((entry) => [entry.tool, entry])
);

export const getToolCatalogEntry = (tool: string): ToolCatalogEntry | undefined => {
  return TOOL_CATALOG_BY_TOOL[tool];
};
