/**
 * @fileoverview Zod validation schemas for workflow automation management.
 *
 * Exported schemas:
 *   createWorkflowBodySchema - Validates creating a new workflow (name, trigger, actions)
 *   workflowIdParamSchema    - Validates :id route param as a 24-char hex ObjectId
 *   runWorkflowBodySchema    - Validates triggering a workflow run (optional idempotency_key)
 *
 * Workflow trigger types (discriminated on "type"):
 *   manual  - Triggered explicitly by user action
 *   cron    - Triggered on a cron schedule (cron expression: 5-120 chars)
 *   event   - Triggered by a domain event (event_type: 2-120 chars)
 *
 * Workflow action types (discriminated on "type"):
 *   create_task        - Create a task with title, why, steps, priority, kind, due_days
 *   send_notification  - Send email or in-app notification with subject and message
 *   export_report      - Generate an export (transactions_csv or monthly_summary_pdf)
 *
 * Used by: v1Routes (GET /workflows/templates, GET/POST /workflows, POST /workflows/:id/run)
 *
 * Key validation rules:
 *   - Workflow name: required, 2-160 chars
 *   - Actions: required array, 1-50 items
 *   - Task actions: kind enum cashflow | budget | debt | invest | goal | education | generic
 *   - Task priority: low | medium | high (default medium)
 *   - Notification actions: channel email | in_app (default email)
 *   - Export actions: monthly_summary_pdf requires period_key in params (enforced by .superRefine)
 *   - runWorkflow idempotency_key: optional 8-128 chars for safe retries
 */
import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

const taskKindSchema = z.enum(["cashflow", "budget", "debt", "invest", "goal", "education", "generic"]);
const taskPrioritySchema = z.enum(["low", "medium", "high"]);
const exportTypeSchema = z.enum(["transactions_csv", "monthly_summary_pdf"]);
const notificationChannelSchema = z.enum(["email", "in_app"]);
const domainEventTypeSchema = z.string().trim().min(2).max(120);

const workflowActionSchema = z.discriminatedUnion("type", [
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
    })
    .strict(),
  z
    .object({
      type: z.literal("send_notification"),
      channel: notificationChannelSchema.default("email"),
      subject: z.string().trim().min(2).max(160),
      message: z.string().trim().min(2).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("export_report"),
      export_type: exportTypeSchema,
      params: z.record(z.string(), z.unknown()).optional().default({}),
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
]);

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
    ]),
    actions: z.array(workflowActionSchema).min(1).max(50),
  })
  .strict();

export const workflowIdParamSchema = z
  .object({
    id: z.string().regex(objectIdRegex, "Invalid workflow id"),
  })
  .strict();

export const runWorkflowBodySchema = z
  .object({
    idempotency_key: z.string().trim().min(8).max(128).optional(),
  })
  .strict();
