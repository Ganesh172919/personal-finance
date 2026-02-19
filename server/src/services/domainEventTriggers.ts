import mongoose from "mongoose";

import DomainEventModel from "../models/domainEventModel";
import WorkflowModel from "../models/workflowModel";
import { enqueueWorkflowRun } from "./workflows";
import { logger } from "../config/logger";

const parseLimit = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(numeric)));
};

export const processDomainEventById = async (domainEventId: string) => {
  if (!mongoose.Types.ObjectId.isValid(domainEventId)) {
    return { ok: false, reason: "invalid_domain_event_id" };
  }

  const event = await DomainEventModel.findById(domainEventId).lean();
  if (!event) {
    return { ok: true, skipped: true, reason: "not_found" };
  }

  if ((event as any).processedAt) {
    return { ok: true, skipped: true, reason: "already_processed" };
  }

  const eventType = String((event as any).eventType || "").trim();
  if (!eventType) {
    await DomainEventModel.updateOne({ _id: (event as any)._id }, { $set: { processedAt: new Date() } }).catch(() => null);
    return { ok: true, skipped: true, reason: "missing_event_type" };
  }

  const workflows = await WorkflowModel.find({
    orgId: (event as any).orgId,
    enabled: true,
    createdByUserId: (event as any).userId,
    "trigger.type": "event",
    "trigger.event_type": eventType,
  })
    .select({ _id: 1, orgId: 1 })
    .lean();

  if (!workflows.length) {
    await DomainEventModel.updateOne({ _id: (event as any)._id }, { $set: { processedAt: new Date() } }).catch(() => null);
    return { ok: true, workflows_matched: 0 };
  }

  let successes = 0;
  for (const workflow of workflows as any[]) {
    const workflowId = workflow?._id;
    if (!workflowId) continue;

    try {
      await enqueueWorkflowRun({
        orgId: (event as any).orgId,
        workflowId,
        triggeredByUserId: (event as any).userId,
        requestId: (event as any).requestId,
        idempotencyKey: `evt:${String((event as any)._id)}`.slice(0, 128),
      });
      successes += 1;
    } catch (error) {
      logger.error(
        {
          event: "domain_event_trigger_failed",
          domain_event_id: String((event as any)._id),
          workflow_id: String(workflowId),
          err: error,
        },
        "Domain event trigger failed"
      );
    }
  }

  if (successes > 0) {
    await DomainEventModel.updateOne({ _id: (event as any)._id }, { $set: { processedAt: new Date() } }).catch(() => null);
  }

  return { ok: true, workflows_matched: workflows.length, runs_enqueued: successes };
};

export const processPendingDomainEvents = async (params: { limit?: number } = {}) => {
  const limit = parseLimit(params.limit, 50);

  const events = await DomainEventModel.find({ processedAt: { $exists: false } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select({ _id: 1 })
    .lean();

  let processed = 0;
  for (const event of events as any[]) {
    const id = String(event?._id || "");
    if (!id) continue;
    await processDomainEventById(id);
    processed += 1;
  }

  return { ok: true, scanned: events.length, processed };
};

