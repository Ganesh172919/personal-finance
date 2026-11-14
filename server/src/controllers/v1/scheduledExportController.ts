import type { Request, Response } from "express";
import mongoose from "mongoose";

import ScheduledExportModel from "../../models/scheduledExportModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { enforceFeatureLimit } from "../../services/entitlements";
import { recordAuditEvent } from "../../services/auditLog";
import { validateOutboundWebhookUrl } from "../../services/outboundWebhook";
import { encryptWebhookCredential } from "../../services/webhookCredentials";
import {
  computeNextRunDate,
  executeScheduledExport,
} from "../../services/scheduledExportService";
import type {
  CreateScheduledExportBody,
  UpdateScheduledExportBody,
} from "../../schemas/v1/scheduledExportSchemas";

// Validates that organization context is attached to the current request.
// Throws a 401 unauthorized error if the organization context is omitted or invalid.
// Returns the active organization ID parsed as a MongoDB ObjectId instance.
const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

// Parses and validates a raw string parameter as a valid MongoDB ObjectId.
// Throws an HTTP 400 error if the supplied parameter is not a 24-character hex string.
// Returns the parsed and strongly typed ObjectId instance for database queries.
const parseObjectIdParam = (value: string) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new HttpError(400, "INVALID_ID", "Invalid identifier format");
  }
  return new mongoose.Types.ObjectId(value);
};

// Converts a scheduled export database document into an external client API representation.
// Sanitizes webhook destinations, masks authentication secrets, and formats date strings.
// Ensures consistent null-safety and predictable structure for all export responses.
const toPublicScheduledExport = (doc: any) => ({
  id: String(doc._id),
  name: String(doc.name),
  type: String(doc.type),
  frequency: String(doc.frequency),
  destination: String(doc.destination || "email"),
  destination_config: doc.destinationConfig
    ? {
        webhook_url: doc.destinationConfig.webhookUrl || doc.destinationConfig.webhook_url,
        has_auth_header: Boolean(doc.destinationConfig.authHeader || doc.destinationConfig.auth_header),
      }
    : {},
  delivery_email: doc.deliveryEmail ? String(doc.deliveryEmail) : undefined,
  status: String(doc.status),
  params: doc.params || {},
  last_run_at: doc.lastRunAt ? new Date(doc.lastRunAt).toISOString() : null,
  next_run_at: doc.nextRunAt ? new Date(doc.nextRunAt).toISOString() : null,
  last_delivery_status: String(doc.lastDeliveryStatus || "none"),
  last_delivery_details: doc.lastDeliveryDetails || null,
  last_error: doc.lastError ? String(doc.lastError) : null,
  created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updated_at: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
});

// Lists all scheduled report exports configured by the authenticated user in the org.
// Queries the database with user and organization scoping sorted by newest first.
// Returns an array of sanitized public scheduled export objects.
export const listScheduledExports = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);

  const schedules = await ScheduledExportModel.find({ orgId, userId: user._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json({
    schedules: schedules.map(toPublicScheduledExport),
    request_id: req.requestId,
  });
};

// Creates a new recurring scheduled export job with email or webhook delivery targets.
// Enforces export access plan entitlements and validates outbound webhook destinations.
// Persists the scheduled export definition and emits an audit event for the creation.
export const createScheduledExport = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const body = req.body as CreateScheduledExportBody;

  // Enforce export_access entitlement
  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "export_access",
    requestId: req.requestId,
  });

  const nextRunAt = computeNextRunDate(body.frequency);
  const destination = body.destination || "email";
  const destinationConfig = body.destination_config
    ? {
        webhookUrl: (body.destination_config as any).webhook_url || (body.destination_config as any).webhookUrl,
        authHeader: ((body.destination_config as any).auth_header || (body.destination_config as any).authHeader)
          ? encryptWebhookCredential((body.destination_config as any).auth_header || (body.destination_config as any).authHeader)
          : undefined,
      }
    : undefined;

  if (destination === "webhook") {
    const webhookUrl = destinationConfig?.webhookUrl;
    if (!webhookUrl) {
      throw new HttpError(400, "WEBHOOK_URL_MISSING", "Webhook destination URL is required");
    }
    await validateOutboundWebhookUrl(webhookUrl);
  }

  const deliveryEmail = body.delivery_email ? body.delivery_email.toLowerCase() : undefined;

  const created = await ScheduledExportModel.create({
    orgId,
    userId: user._id,
    name: body.name,
    type: body.type,
    frequency: body.frequency,
    destination,
    destinationConfig,
    deliveryEmail,
    status: "active",
    params: body.params || {},
    nextRunAt,
  });

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "scheduled_export_created",
    targetType: "scheduled_export",
    targetId: created._id.toString(),
    requestId: req.requestId,
    metadata: {
      type: body.type,
      frequency: body.frequency,
      destination,
      delivery_email: body.delivery_email,
    },
  });

  return res.status(201).json({
    schedule: toPublicScheduledExport(created),
    request_id: req.requestId,
  });
};

// Updates configuration parameters and schedules of an existing scheduled export.
// Recomputes next run timestamps upon frequency changes and encrypts webhook credentials.
// Saves updated schedule settings to the database and returns the modified object.
export const updateScheduledExport = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const scheduleId = parseObjectIdParam(String(req.params.id || ""));
  const body = req.body as UpdateScheduledExportBody;

  const schedule = await ScheduledExportModel.findOne({
    _id: scheduleId,
    orgId,
    userId: user._id,
  });

  if (!schedule) {
    throw new HttpError(404, "SCHEDULED_EXPORT_NOT_FOUND", "Scheduled export not found");
  }

  if (body.name !== undefined) schedule.name = body.name;
  if (body.frequency !== undefined) {
    schedule.frequency = body.frequency;
    schedule.nextRunAt = computeNextRunDate(body.frequency);
  }
  const requestedDestination = body.destination || schedule.destination;
  if (body.destination !== undefined) schedule.destination = body.destination;
  if (body.destination_config !== undefined) {
    const incomingConfig = body.destination_config as {
      webhook_url?: string;
      webhookUrl?: string;
      auth_header?: string;
      authHeader?: string;
    };
    const existingConfig = schedule.destinationConfig || {};
    const providedAuthorization = incomingConfig.auth_header ?? incomingConfig.authHeader;
    schedule.destinationConfig = {
      webhookUrl: incomingConfig.webhook_url ?? incomingConfig.webhookUrl ?? existingConfig.webhookUrl,
      // Omitted credentials remain unchanged. An explicit empty string removes
      // the saved authorization header without ever returning its value.
      authHeader:
        providedAuthorization === undefined
          ? existingConfig.authHeader
          : providedAuthorization
            ? encryptWebhookCredential(providedAuthorization)
            : undefined,
    };
  }
  if (requestedDestination === "webhook") {
    const webhookUrl = schedule.destinationConfig?.webhookUrl;
    if (!webhookUrl) {
      throw new HttpError(400, "WEBHOOK_URL_MISSING", "Webhook destination URL is required");
    }
    await validateOutboundWebhookUrl(webhookUrl);
  }
  if (body.delivery_email !== undefined) {
    schedule.deliveryEmail = body.delivery_email ? body.delivery_email.toLowerCase() : undefined;
  }
  if (body.status !== undefined) schedule.status = body.status;
  if (body.params !== undefined) schedule.params = body.params;

  await schedule.save();

  return res.json({
    schedule: toPublicScheduledExport(schedule),
    request_id: req.requestId,
  });
};

// Deletes an existing scheduled export record owned by the authenticated user.
// Enforces user and organization ownership boundaries before removing the entity.
// Emits an audit log event recording schedule deletion and returns the deleted ID.
export const deleteScheduledExport = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const scheduleId = parseObjectIdParam(String(req.params.id || ""));

  const deleted = await ScheduledExportModel.findOneAndDelete({
    _id: scheduleId,
    orgId,
    userId: user._id,
  });

  if (!deleted) {
    throw new HttpError(404, "SCHEDULED_EXPORT_NOT_FOUND", "Scheduled export not found");
  }

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "scheduled_export_deleted",
    targetType: "scheduled_export",
    targetId: scheduleId.toString(),
    requestId: req.requestId,
  });

  return res.json({
    success: true,
    deleted_id: scheduleId.toString(),
    request_id: req.requestId,
  });
};

// Triggers immediate on-demand execution of an active scheduled export job.
// Verifies user ownership within the organization and dispatches job processing.
// Returns execution status, delivery results, and the associated request identifier.
export const triggerScheduledExportNow = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const scheduleId = parseObjectIdParam(String(req.params.id || ""));

  const schedule = await ScheduledExportModel.findOne({
    _id: scheduleId,
    orgId,
    userId: user._id,
  });

  if (!schedule) {
    throw new HttpError(404, "SCHEDULED_EXPORT_NOT_FOUND", "Scheduled export not found");
  }

  const result = await executeScheduledExport(schedule._id.toString());

  return res.json({
    result,
    request_id: req.requestId,
  });
};
