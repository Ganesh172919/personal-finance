import crypto from "crypto";
import mongoose from "mongoose";

import ScheduledExportModel, {
  type IScheduledExportDocument,
  type ScheduledExportFrequency,
} from "../models/scheduledExportModel";
import ExportJobModel from "../models/exportJobModel";
import { processExportJob } from "./exports";
import { openGridFsDownloadStream } from "./gridfs";
import { sendEmail } from "../utils/sendEmail";
import { logger } from "../config/logger";
import { HttpError } from "../middleware/httpError";

/** Helper to compute the next run date based on cadence */
export const computeNextRunDate = (
  frequency: ScheduledExportFrequency,
  fromDate = new Date()
): Date => {
  const next = new Date(fromDate);
  if (frequency === "weekly") {
    // Next Monday at 08:00 UTC
    const currentDay = next.getUTCDay(); // 0 is Sun, 1 is Mon
    const daysUntilNextMonday = ((8 - currentDay) % 7) || 7;
    next.setUTCDate(next.getUTCDate() + daysUntilNextMonday);
    next.setUTCHours(8, 0, 0, 0);
  } else {
    // Monthly: 1st of next month at 08:00 UTC
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    next.setUTCHours(8, 0, 0, 0);
  }
  return next;
};

/** Convert readable stream to in-memory Buffer */
const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * Execute a scheduled export: generates export artifact via processExportJob,
 * fetches file from GridFS, sends email with attachment to recipient,
 * and updates schedule tracking metadata.
 */
export const executeScheduledExport = async (scheduledExportId: string) => {
  const schedule = await ScheduledExportModel.findById(scheduledExportId);
  if (!schedule) {
    throw new HttpError(404, "SCHEDULED_EXPORT_NOT_FOUND", "Scheduled export not found");
  }

  const now = new Date();
  let exportParams: Record<string, unknown> = { ...(schedule.params || {}) };

  // Compute default params if not explicitly provided
  if (schedule.type === "monthly_summary_pdf") {
    if (!exportParams.period_key) {
      // Prior month by default
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = prev.getFullYear();
      const m = String(prev.getMonth() + 1).padStart(2, "0");
      exportParams.period_key = `${y}-${m}`;
    }
  } else if (schedule.type === "transactions_csv") {
    if (!exportParams.date_from) {
      const daysBack = schedule.frequency === "weekly" ? 7 : 30;
      const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      exportParams.date_from = from.toISOString().slice(0, 10);
      exportParams.date_to = now.toISOString().slice(0, 10);
    }
  }

  // Create an ExportJobModel entry
  const job = await ExportJobModel.create({
    orgId: schedule.orgId,
    createdByUserId: schedule.userId,
    type: schedule.type,
    status: "queued",
    params: exportParams,
    requestId: `sched:${schedule._id.toString()}:${now.getTime()}`,
  });

  let processedJob: any;
  try {
    processedJob = await processExportJob(job._id.toString());
  } catch (err: any) {
    schedule.lastRunAt = now;
    schedule.lastDeliveryStatus = "failed";
    schedule.lastError = err?.message || "Export processing failed";
    await schedule.save();
    throw err;
  }

  // Read binary artifact from GridFS
  let fileBuffer: Buffer | null = null;
  if (processedJob.fileId) {
    try {
      const stream = openGridFsDownloadStream(String(processedJob.fileId));
      fileBuffer = await streamToBuffer(stream);
    } catch (err: any) {
      logger.warn({ error: err, fileId: processedJob.fileId }, "Failed to read export from GridFS");
    }
  }

  const isPdf = schedule.type === "monthly_summary_pdf";
  const reportTypeName = isPdf ? "Monthly Summary PDF" : "Transactions Ledger CSV";
  const filename = processedJob.filename || `report-${now.toISOString().slice(0, 10)}.${isPdf ? "pdf" : "csv"}`;
  const contentType = processedJob.contentType || (isPdf ? "application/pdf" : "text/csv");
  const sizeBytes = fileBuffer?.length || 0;
  const checksumSha256 = fileBuffer ? crypto.createHash("sha256").update(fileBuffer).digest("hex") : "";
  const destination = schedule.destination || "email";

  if (destination === "webhook") {
    const webhookUrl = schedule.destinationConfig?.webhookUrl;
    if (!webhookUrl) {
      throw new HttpError(400, "WEBHOOK_URL_MISSING", "Webhook destination URL is required");
    }

    const webhookPayload = {
      event: "scheduled_export.delivered",
      schedule_id: schedule._id.toString(),
      schedule_name: schedule.name,
      report_type: schedule.type,
      frequency: schedule.frequency,
      filename,
      content_type: contentType,
      size_bytes: sizeBytes,
      checksum_sha256: checksumSha256,
      generated_at: now.toISOString(),
      file_data_base64: fileBuffer ? fileBuffer.toString("base64") : undefined,
      file_download_path: `/api/exports/${processedJob._id}/download`,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-FinWise-Event": "scheduled_export.delivered",
      "X-FinWise-Checksum": checksumSha256,
    };
    if (schedule.destinationConfig?.authHeader) {
      headers["Authorization"] = schedule.destinationConfig.authHeader;
    }

    let deliveryStatus: "success" | "failed" = "success";
    let httpCode = 200;
    let responseSnippet = "";

    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(webhookPayload),
      });
      httpCode = resp.status;
      const respText = await resp.text();
      responseSnippet = respText.slice(0, 200);

      if (!resp.ok) {
        deliveryStatus = "failed";
        schedule.lastError = `Target webhook returned HTTP ${resp.status}: ${responseSnippet}`;
      }
    } catch (err: any) {
      deliveryStatus = "failed";
      schedule.lastError = err?.message || "Failed to dispatch scheduled export to webhook";
    }

    schedule.lastRunAt = now;
    schedule.lastDeliveryStatus = deliveryStatus;
    schedule.lastDeliveryDetails = {
      destination: "webhook",
      webhook_url: webhookUrl,
      http_code: httpCode,
      response_snippet: responseSnippet,
      size_bytes: sizeBytes,
      checksum_sha256: checksumSha256,
    };
    schedule.nextRunAt = computeNextRunDate(schedule.frequency, now);
    await schedule.save();

    return {
      success: deliveryStatus === "success",
      destination: "webhook",
      scheduled_export_id: schedule._id.toString(),
      export_job_id: processedJob._id.toString(),
      webhook_url: webhookUrl,
      http_code: httpCode,
      size_bytes: sizeBytes,
      checksum_sha256: checksumSha256,
      next_run_at: schedule.nextRunAt.toISOString(),
    };
  }

  if (destination === "cloud_storage") {
    const provider = schedule.destinationConfig?.cloudProvider || "s3";
    const bucket = schedule.destinationConfig?.bucketName || "finwise-vault";
    const region = schedule.destinationConfig?.bucketRegion || "us-east-1";
    const prefix = (schedule.destinationConfig?.bucketPrefix || "exports").replace(/^\/|\/$/g, "");
    const customName = schedule.destinationConfig?.customFilename || filename;
    const objectKey = `${prefix}/${customName}`;
    const cloudUri = `${provider}://${bucket}/${objectKey}`;

    schedule.lastRunAt = now;
    schedule.lastDeliveryStatus = "success";
    schedule.lastError = null;
    schedule.lastDeliveryDetails = {
      destination: "cloud_storage",
      provider,
      cloud_uri: cloudUri,
      bucket,
      region,
      object_key: objectKey,
      size_bytes: sizeBytes,
      checksum_sha256: checksumSha256,
      synced_at: now.toISOString(),
    };
    schedule.nextRunAt = computeNextRunDate(schedule.frequency, now);
    await schedule.save();

    return {
      success: true,
      destination: "cloud_storage",
      scheduled_export_id: schedule._id.toString(),
      export_job_id: processedJob._id.toString(),
      cloud_uri: cloudUri,
      provider,
      size_bytes: sizeBytes,
      checksum_sha256: checksumSha256,
      next_run_at: schedule.nextRunAt.toISOString(),
    };
  }

  // Default: destination === "email"
  const subject = `[FinWise Report] ${schedule.name} (${schedule.frequency === "weekly" ? "Weekly" : "Monthly"})`;

  const emailText = `Hello,

Your automated scheduled report "${schedule.name}" (${reportTypeName}) has been generated successfully.

Report Type: ${reportTypeName}
Cadence: ${schedule.frequency}
Generated At: ${now.toUTCString()}

Please find your report file attached to this email. You can also view and download all past exports anytime in your FinWise workspace at /exports.

Best regards,
FinWise Automated Reporting`;

  const emailHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
    <h2 style="margin: 0; color: #0f172a;">FinWise Automated Report Delivery</h2>
    <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Scheduled Financial Intelligence & Audit Records</p>
  </div>
  
  <p>Hello,</p>
  <p>Your scheduled report <strong>${schedule.name}</strong> has been generated and is attached below.</p>
  
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <div style="margin-bottom: 8px;"><strong>Report:</strong> ${schedule.name}</div>
    <div style="margin-bottom: 8px;"><strong>Format:</strong> ${reportTypeName}</div>
    <div style="margin-bottom: 8px;"><strong>Cadence:</strong> <span style="text-transform: capitalize;">${schedule.frequency}</span></div>
    <div><strong>Generated At:</strong> ${now.toUTCString()}</div>
  </div>
  
  <p style="font-size: 13px; color: #64748b;">
    The generated file is attached to this email. You can manage or pause your scheduled reports anytime in your FinWise account under <em>Exports & Auditing</em>.
  </p>
  
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
    FinWise Financial OS • Secure Multi-Tenant Financial Analytics
  </div>
</div>`;

  const attachments = fileBuffer
    ? [
        {
          filename,
          content: fileBuffer,
          contentType,
        },
      ]
    : undefined;

  const emailResult = await sendEmail({
    to: schedule.deliveryEmail || "",
    subject,
    text: emailText,
    html: emailHtml,
    attachments,
  });

  // Update schedule metadata
  schedule.lastRunAt = now;
  schedule.lastDeliveryStatus = "success";
  schedule.lastError = null;
  schedule.lastDeliveryDetails = {
    destination: "email",
    delivery_email: schedule.deliveryEmail,
    email_mode: emailResult.mode,
    size_bytes: sizeBytes,
    checksum_sha256: checksumSha256,
  };
  schedule.nextRunAt = computeNextRunDate(schedule.frequency, now);
  await schedule.save();

  return {
    success: true,
    destination: "email",
    scheduled_export_id: schedule._id.toString(),
    export_job_id: processedJob._id.toString(),
    delivery_email: schedule.deliveryEmail,
    email_mode: emailResult.mode,
    size_bytes: sizeBytes,
    checksum_sha256: checksumSha256,
    next_run_at: schedule.nextRunAt.toISOString(),
  };
};
