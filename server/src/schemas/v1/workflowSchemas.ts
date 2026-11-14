/**
 * @fileoverview Zod validation schemas for workflow automation management.
 *
 * Exported schemas:
 *   createWorkflowBodySchema   - Validates creating a new workflow (name, trigger, actions)
 *   workflowIdParamSchema      - Validates :id route param as a 24-char hex ObjectId
 *   runWorkflowBodySchema      - Validates triggering a workflow run (optional idempotency_key, optional payload)
 *   webhookTokenParamSchema    - Validates :token route param for inbound webhooks (16-128 chars)
 *   webhookPayloadBodySchema   - Validates inbound webhook JSON payload (Record<string, unknown>)
 *
 * Workflow trigger types (discriminated on "type"):
 *   manual   - Triggered explicitly by user action
 *   cron     - Triggered on a cron schedule (cron expression: 5-120 chars)
 *   event    - Triggered by a domain event (event_type: 2-120 chars)
 *   webhook  - Triggered by an external HTTP POST request with a unique webhook_token
 *
 * Workflow action types (discriminated on "type"):
 *   create_task        - Create a task with title, why, steps, priority, kind, due_days
 *   send_notification  - Send email or in-app notification with subject and message
 *   export_report      - Generate an export (transactions_csv or monthly_summary_pdf)
 *   delay              - Delay timer pausing pipeline execution for a duration in seconds (1s to 30d)
 *
 * Conditional Branching:
 *   All actions support an optional `condition` object ({ field, operator, value })
 *   to selectively execute or bypass based on the trigger context / webhook payload.
 *
 * Used by: v1Routes (GET /workflows/templates, GET/POST /workflows, POST /workflows/:id/run, POST /workflows/webhook/:token)
 */
import { z } from "zod";

// Regular expression pattern validating 24-character hexadecimal MongoDB ObjectIds.
// Used for validating workflow entity identifiers in workflow route parameters.
// Case-insensitively checks standard hex format.
const objectIdRegex = /^[a-f\d]{24}$/i;

// Enumerates permissible task domain classifications created by workflow actions.
// Enforces task category typing including cashflow, budget, debt, and goal domains.
// Ensures tasks dispatched by automation conform to standard task classifications.
const taskKindSchema = z.enum(["cashflow", "budget", "debt", "invest", "goal", "education", "generic"]);
// Enumerates priority severity levels for automated task creation steps.
// Restricts priority choices strictly to low, medium, or high values.
// Determines UI ordering and urgency when presenting workflow tasks to users.
const taskPrioritySchema = z.enum(["low", "medium", "high"]);
// Enumerates acceptable export formats supported by automated report export actions.
// Allows automated export of transaction CSV files or monthly summary PDFs.
// Prevents invalid export targets from entering workflow pipeline actions.
const exportTypeSchema = z.enum(["transactions_csv", "monthly_summary_pdf"]);
// Enumerates supported delivery channels for workflow notification steps.
// Restricts channels to transactional email messages or in-app activity notices.
// Controls message routing behavior within notification execution workers.
const notificationChannelSchema = z.enum(["email", "in_app"]);
// Validates domain event naming formats for event-driven workflow triggers.
// Enforces string length boundaries between 2 and 120 characters on event identifiers.
// Prevents empty or excessively long event names from registering in trigger indices.
const domainEventTypeSchema = z.string().trim().min(2).max(120);

// Enumerates comparison operators supported in workflow action conditional expressions.
// Supports equality, inequality, numeric comparisons, and substring matching.
// Powers conditional branch logic when deciding whether to execute an action.
export const workflowConditionOperatorSchema = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains"]);

// Validates conditional evaluation clauses assigned to workflow steps.
// Defines target context field path, comparison operator, and primitive expected value.
// Restricts extra properties to guarantee deterministic rule evaluation.
export const workflowActionConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    operator: workflowConditionOperatorSchema,
    value: z.union([z.string(), z.number(), z.boolean()]),
  })
  .strict();

// Discriminated union schema validating actionable steps within an automation workflow.
// Dispatches validation across task creation, notification, export, and delay steps.
// Enforces action-specific parameters including period keys for monthly summary exports.
export const workflowActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create_task"),
      bucket: z.union([z.literal(7), z.literal(30), z.literal(365)]),
      title: z.string().trim().min(2).max(160),
      why: z.string().trim().min(2).max(600),
      steps: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
      priority: taskPrioritySchema.default("medium"),
      expected_impact: z.string().trim().min(2).max(600),
      kind: taskKindSchema.default("generic"),
      due_days: z.number().int().positive().max(3650).optional(),
      condition: workflowActionConditionSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("send_notification"),
      channel: notificationChannelSchema.default("email"),
      subject: z.string().trim().min(2).max(160),
      message: z.string().trim().min(2).max(2000),
      condition: workflowActionConditionSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("export_report"),
      export_type: exportTypeSchema,
      params: z.record(z.string(), z.unknown()).optional().default({}),
      condition: workflowActionConditionSchema.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.export_type === "monthly_summary_pdf") {
        const key = (value.params as any)?.period_key;
        if (typeof key !== "string" || !/^\d{4}-\d{2}$/.test(key.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "params.period_key is required when export_type=monthly_summary_pdf (YYYY-MM)",
            path: ["params", "period_key"],
          });
        }
      }
    }),
  z
    .object({
      type: z.literal("delay"),
      duration_seconds: z.number().int().min(1).max(86400 * 30),
      description: z.string().trim().max(200).optional(),
      condition: workflowActionConditionSchema.optional(),
    })
    .strict(),
]);

// Validates request payload for creating an end-to-end automated workflow definition.
// Enforces workflow name, activation flag, trigger specifications, and ordered action steps.
// Ensures at least one action is specified up to a maximum limit of 50 actions.
export const createWorkflowBodySchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    enabled: z.boolean().optional(),
    trigger: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("manual"),
        })
        .strict(),
      z
        .object({
          type: z.literal("cron"),
          cron: z.string().trim().min(5).max(120),
        })
        .strict(),
      z
        .object({
          type: z.literal("event"),
          event_type: domainEventTypeSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal("webhook"),
          webhook_token: z.string().trim().min(16).max(128).optional(),
        })
        .strict(),
    ]),
    actions: z.array(workflowActionSchema).min(1).max(50),
  })
  .strict();

// Validates route parameter objects containing a workflow identifier.
// Enforces 24-character hexadecimal ObjectId format on the id route param.
// Rejects malformed identifier strings before attempting workflow database queries.
export const workflowIdParamSchema = z
  .object({
    id: z.string().regex(objectIdRegex, "Invalid workflow id"),
  })
  .strict();

// Validates request payload submitted when triggering an on-demand workflow execution.
// Supports optional idempotency keys for deduplication and arbitrary context payloads.
// Restricts unexpected payload attributes using strict schema evaluation.
export const runWorkflowBodySchema = z
  .object({
    idempotency_key: z.string().trim().min(8).max(128).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// Validates route parameter containing an inbound webhook authentication token.
// Enforces string presence and bounds between 16 and 128 characters in length.
// Protects webhook ingestion routes against malformed authentication tokens.
export const webhookTokenParamSchema = z
  .object({
    token: z.string().trim().min(16).max(128),
  })
  .strict();

// Validates generic JSON payload bodies delivered to inbound workflow webhook endpoints.
// Accepts arbitrary key-value mappings to allow flexible integration with third-party webhooks.
// Ensures incoming webhook payload is a valid JSON object structure.
export const webhookPayloadBodySchema = z.record(z.string(), z.unknown());
