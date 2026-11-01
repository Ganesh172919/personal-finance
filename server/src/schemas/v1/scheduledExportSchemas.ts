import { z } from "zod";

export const scheduledExportDestinationConfigSchema = z
  .object({
    webhook_url: z.string().url("Valid webhook URL required").optional(),
    webhookUrl: z.string().url("Valid webhook URL required").optional(),
    auth_header: z.string().trim().max(500).optional(),
    authHeader: z.string().trim().max(500).optional(),
    cloud_provider: z.enum(["s3", "gcs"]).optional(),
    cloudProvider: z.enum(["s3", "gcs"]).optional(),
    bucket_name: z.string().trim().max(120).optional(),
    bucketName: z.string().trim().max(120).optional(),
    bucket_region: z.string().trim().max(60).optional(),
    bucketRegion: z.string().trim().max(60).optional(),
    bucket_prefix: z.string().trim().max(200).optional(),
    bucketPrefix: z.string().trim().max(200).optional(),
    custom_filename: z.string().trim().max(120).optional(),
    customFilename: z.string().trim().max(120).optional(),
  });

export const createScheduledExportBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name too long"),
    type: z.enum(["transactions_csv", "monthly_summary_pdf"]),
    frequency: z.enum(["weekly", "monthly"]).default("monthly"),
    destination: z.enum(["email", "webhook", "cloud_storage"]).default("email"),
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
    const hasBucket = Boolean(data.destination_config?.bucket_name || data.destination_config?.bucketName);
    if (data.destination === "cloud_storage" && !hasBucket) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination_config", "bucket_name"],
        message: "Target bucket name is required for cloud storage push",
      });
    }
  });

export const updateScheduledExportBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
  destination: z.enum(["email", "webhook", "cloud_storage"]).optional(),
  delivery_email: z.string().trim().email("Invalid email address").optional(),
  destination_config: scheduledExportDestinationConfigSchema.optional(),
  status: z.enum(["active", "paused"]).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const scheduledExportIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid schedule ID format"),
});

export type CreateScheduledExportBody = z.infer<typeof createScheduledExportBodySchema>;
export type UpdateScheduledExportBody = z.infer<typeof updateScheduledExportBodySchema>;
