/**
 * @fileoverview Export Controller (v1)
 *
 * Data export system. Users can request exports (e.g., CSV of transactions),
 * which are processed asynchronously (when ASYNC_JOBS_ENABLED) or synchronously.
 * Completed exports are downloadable from GridFS.
 *
 * Routes served:
 *   GET    /api/v1/exports         - listExports
 *   POST   /api/v1/exports         - createExport
 *   GET    /api/v1/exports/:id     - getExportById
 *   GET    /api/v1/exports/:id/download - downloadExport
 *
 * Key patterns:
 *   - Feature limit enforced via "export_access" entitlement
 *   - Idempotency key prevents duplicate export creation
 *   - Async mode: returns 201 with queued=true; sync mode: processes inline
 *   - Download streams from GridFS with Content-Disposition: attachment
 *   - Audit event recorded on export creation
 *
 * @module controllers/v1/exportController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import ExportJobModel from "../../models/exportJobModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { enforceFeatureLimit, recordFeatureUsage } from "../../services/entitlements";
import { recordAuditEvent } from "../../services/auditLog";
import { processExportJob } from "../../services/exports";
import { assertGridFsOwnership, openGridFsDownloadStream } from "../../services/gridfs";
import { getEnv } from "../../config/env";

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

const toPublicJob = (job: any) => ({
  id: String(job._id),
  type: String(job.type),
  status: String(job.status),
  params: job.params && typeof job.params === "object" ? job.params : {},
  filename: job.filename ? String(job.filename) : undefined,
  content_type: job.contentType ? String(job.contentType) : undefined,
  bytes: typeof job.bytes === "number" ? job.bytes : undefined,
  started_at: job.startedAt ? new Date(job.startedAt).toISOString() : undefined,
  finished_at: job.finishedAt ? new Date(job.finishedAt).toISOString() : undefined,
  error: job.error ? String(job.error) : undefined,
  created_at: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
  updated_at: job.updatedAt ? new Date(job.updatedAt).toISOString() : undefined,
});

export const listExports = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);

  const limitRaw = (req.query as any)?.limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Math.min(Math.max(1, Number(limitRaw)), 100) : 25;

  const statusRaw = typeof (req.query as any)?.status === "string" ? String((req.query as any).status).trim() : "";
  const status =
    statusRaw === "queued" || statusRaw === "running" || statusRaw === "succeeded" || statusRaw === "failed"
      ? statusRaw
      : undefined;

  const match: Record<string, unknown> = { orgId, createdByUserId: user._id };
  if (status) {
    match.status = status;
  }

  const jobs = await ExportJobModel.find(match).sort({ createdAt: -1 }).limit(limit).lean();

  return res.json({
    exports: jobs.map(toPublicJob),
    request_id: req.requestId,
  });
};

export const createExport = async (req: Request, res: Response) => {
  const env = getEnv();
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const body = req.body as {
    type: string;
    params?: Record<string, unknown>;
    idempotency_key?: string;
  };

  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "export_access",
    requestId: req.requestId,
  });

  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim().length > 0
      ? body.idempotency_key.trim().slice(0, 128)
      : undefined;

  if (idempotencyKey) {
    const existing = await ExportJobModel.findOne({ orgId, createdByUserId: user._id, idempotencyKey }).lean();
    if (existing) {
      if (!env.ASYNC_JOBS_ENABLED) {
        return res.status(200).json({ export: toPublicJob(existing), queued: false, request_id: req.requestId });
      }
      const status = String((existing as any)?.status || "queued");
      const terminal = status === "succeeded" || status === "failed";
      return res.status(200).json({ export: toPublicJob(existing), queued: !terminal, request_id: req.requestId });
    }
  }

  const created = await ExportJobModel.create({
    orgId,
    createdByUserId: user._id,
    type: body.type,
    status: "queued",
    params: body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params : {},
    requestId: req.requestId,
    idempotencyKey,
  });

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: user._id,
    action: "export_created",
    targetType: "export_job",
    targetId: created._id.toString(),
    requestId: req.requestId,
    metadata: { export_type: body.type },
  });

  await recordFeatureUsage({
    orgId,
    userId: user._id,
    feature: "export_access",
    units: 1,
    requestId: req.requestId,
    idempotencyKey: `export:${created._id.toString()}`,
    context: { export_type: body.type },
  }).catch(() => null);

  const exportJobId = created._id.toString();

  // Async mode: job is queued for background processing (returns immediately)
  // Sync mode: job is processed inline and the result is returned in the same request
  if (env.ASYNC_JOBS_ENABLED) {
    return res.status(201).json({ export: toPublicJob(created), queued: true, request_id: req.requestId });
  }

  const processed = await processExportJob(exportJobId);
  return res.status(201).json({ export: toPublicJob(processed), queued: false, request_id: req.requestId });
};

export const getExportById = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const exportId = parseObjectIdParam(String((req.params as any)?.id || ""));

  const job = await ExportJobModel.findOne({ _id: exportId, orgId, createdByUserId: user._id }).lean();
  if (!job) {
    throw new HttpError(404, "EXPORT_NOT_FOUND", "Export not found");
  }

  return res.json({ export: toPublicJob(job), request_id: req.requestId });
};

export const downloadExport = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const exportId = parseObjectIdParam(String((req.params as any)?.id || ""));

  const job = await ExportJobModel.findOne({ _id: exportId, orgId, createdByUserId: user._id }).lean();
  if (!job) {
    throw new HttpError(404, "EXPORT_NOT_FOUND", "Export not found");
  }

  if (job.status !== "succeeded" || !(job as any).fileId) {
    throw new HttpError(409, "EXPORT_NOT_READY", "Export is not ready");
  }

  const fileId = String((job as any).fileId);
  await assertGridFsOwnership({
    fileId,
    userId: user._id.toString(),
    orgId: orgId.toString(),
    purpose: "export",
  });

  const filename = (job as any).filename ? String((job as any).filename) : `export-${exportId.toString()}`;
  const contentType = (job as any).contentType ? String((job as any).contentType) : "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, max-age=0, no-store");

  const stream = openGridFsDownloadStream(fileId);
  stream.on("error", () => {
    res.status(404).end();
  });
  stream.pipe(res);
};
