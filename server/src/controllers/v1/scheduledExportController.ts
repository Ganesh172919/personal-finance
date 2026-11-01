import type { Request, Response } from "express";
import mongoose from "mongoose";

import ScheduledExportModel from "../../models/scheduledExportModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { enforceFeatureLimit } from "../../services/entitlements";
import { recordAuditEvent } from "../../services/auditLog";
import {
  computeNextRunDate,
  executeScheduledExport,
} from "../../services/scheduledExportService";
import type {
  CreateScheduledExportBody,
  UpdateScheduledExportBody,
} from "../../schemas/v1/scheduledExportSchemas";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const parseObjectIdParam = (value: string) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new HttpError(400, "INVALID_ID", "Invalid identifier format");
  }
  return new mongoose.Types.ObjectId(value);
};

const toPublicScheduledExport = (doc: any) => ({
  id: String(doc._id),
  name: String(doc.name),
  type: String(doc.type),
  frequency: String(doc.frequency),
  destination: String(doc.destination || "email"),
  destination_config: doc.destinationConfig
    ? {
        webhook_url: doc.destinationConfig.webhookUrl || doc.destinationConfig.webhook_url,
        auth_header: doc.destinationConfig.authHeader || doc.destinationConfig.auth_header,
        cloud_provider: doc.destinationConfig.cloudProvider || doc.destinationConfig.cloud_provider,
        bucket_name: doc.destinationConfig.bucketName || doc.destinationConfig.bucket_name,
        bucket_region: doc.destinationConfig.bucketRegion || doc.destinationConfig.bucket_region,
        bucket_prefix: doc.destinationConfig.bucketPrefix || doc.destinationConfig.bucket_prefix,
        custom_filename: doc.destinationConfig.customFilename || doc.destinationConfig.custom_filename,
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
        authHeader: (body.destination_config as any).auth_header || (body.destination_config as any).authHeader,
        cloudProvider: (body.destination_config as any).cloud_provider || (body.destination_config as any).cloudProvider,
        bucketName: (body.destination_config as any).bucket_name || (body.destination_config as any).bucketName,
        bucketRegion: (body.destination_config as any).bucket_region || (body.destination_config as any).bucketRegion,
        bucketPrefix: (body.destination_config as any).bucket_prefix || (body.destination_config as any).bucketPrefix,
        customFilename: (body.destination_config as any).custom_filename || (body.destination_config as any).customFilename,
      }
    : undefined;

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
  if (body.destination !== undefined) schedule.destination = body.destination;
  if (body.destination_config !== undefined) {
    schedule.destinationConfig = {
      webhookUrl: (body.destination_config as any).webhook_url || (body.destination_config as any).webhookUrl,
      authHeader: (body.destination_config as any).auth_header || (body.destination_config as any).authHeader,
      cloudProvider: (body.destination_config as any).cloud_provider || (body.destination_config as any).cloudProvider,
      bucketName: (body.destination_config as any).bucket_name || (body.destination_config as any).bucketName,
      bucketRegion: (body.destination_config as any).bucket_region || (body.destination_config as any).bucketRegion,
      bucketPrefix: (body.destination_config as any).bucket_prefix || (body.destination_config as any).bucketPrefix,
      customFilename: (body.destination_config as any).custom_filename || (body.destination_config as any).customFilename,
    };
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
