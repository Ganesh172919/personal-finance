import { z } from "zod";

// Validates destination endpoint configurations for scheduled export delivery.
// Supports both snake_case and camelCase webhook URL options alongside authorization headers.
// Ensures external webhook configurations satisfy strict URL schema validation.
export const scheduledExportDestinationConfigSchema = z
  .object({
    webhook_url: z.string().url("Valid webhook URL required").optional(),
    webhookUrl: z.string().url("Valid webhook URL required").optional(),
    auth_header: z.string().trim().max(500).optional(),
    authHeader: z.string().trim().max(500).optional(),
  });

// Validates payload attributes for creating automated scheduled recurring export jobs.
// Enforces export type, cadence frequencies, destination mediums, and custom export parameters.
// Performs super-refinement ensuring matching destination configurations for email or webhook targets.
export const createScheduledExportBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name too long"),
    type: z.enum(["transactions_csv", "monthly_summary_pdf"]),
    frequency: z.enum(["weekly", "monthly"]).default("monthly"),
    destination: z.enum(["email", "webhook"]).default("email"),
    delivery_email: z.string().trim().email("Invalid email address").optional(),
    destination_config: scheduledExportDestinationConfigSchema.optional(),
    params: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .superRefine((data, ctx) => {
    if (data.destination === "email" && !data.delivery_email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delivery_email"],
        message: "Recipient email is required for email delivery",
      });
    }
    const hasWebhookUrl = Boolean(data.destination_config?.webhook_url || data.destination_config?.webhookUrl);
    if (data.destination === "webhook" && !hasWebhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination_config", "webhook_url"],
        message: "Target webhook URL is required for webhook push",
      });
    }
  });

// Validates modification payloads when altering an existing scheduled export rule.
// Permits partial updates to schedule frequency, delivery destination, and job parameters.
// Supports toggling schedule execution status between active and paused states.
export const updateScheduledExportBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
  destination: z.enum(["email", "webhook"]).optional(),
  delivery_email: z.string().trim().email("Invalid email address").optional(),
  destination_config: scheduledExportDestinationConfigSchema.optional(),
  status: z.enum(["active", "paused"]).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// Validates route parameter objects containing a scheduled export identifier.
// Enforces 24-character hexadecimal ObjectId format for schedule ID route params.
// Rejects malformed identifier strings before attempting schedule lookup operations.
export const scheduledExportIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid schedule ID format"),
});

// Inferred TypeScript interface for scheduled export creation request payloads.
// Represents the validated schedule model required to enqueue recurring jobs.
// Facilitates static type checking across scheduled export controller endpoints.
export type CreateScheduledExportBody = z.infer<typeof createScheduledExportBodySchema>;
// Inferred TypeScript interface for scheduled export modification request payloads.
// Types partial updates applied when altering recurring export settings.
// Ensures complete compile-time type safety when handling schedule patches.
export type UpdateScheduledExportBody = z.infer<typeof updateScheduledExportBodySchema>;
