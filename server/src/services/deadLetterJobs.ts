/**
 * @fileoverview Listing and replay of persistent dead-letter jobs (`dead_letter_jobs`).
 * Replay re-queues the original job with a fresh attempt budget (or re-runs the optimizer for `ai_optimize`).
 */
import mongoose from "mongoose";

import DeadLetterJobModel from "../models/deadLetterJobModel";
import { HttpError } from "../middleware/httpError";
import { runOptimizeForOrg } from "./aiOptimizeScheduler";
import { retryableJobModel } from "./jobRetry";

// Queries paginated dead-letter job records for administrative inspection.
// Supports status filtering (pending, replayed, or all), kind discrimination, and cursor pagination.
// Delivers sanitized list items with pagination cursor for next batch retrieval.
export const listDeadLetterJobs = async (input: {
  orgId: string;
  status: "pending" | "replayed" | "all";
  kind?: string;
  limit: number;
  cursor?: string;
}) => {
  const filter: Record<string, any> = { orgId: new mongoose.Types.ObjectId(input.orgId) };
  if (input.status === "pending") filter.replayedAt = { $exists: false };
  if (input.status === "replayed") filter.replayedAt = { $exists: true };
  if (input.kind) filter.kind = input.kind;
  if (input.cursor) filter._id = { $lt: new mongoose.Types.ObjectId(input.cursor) };

  const rows: any[] = await DeadLetterJobModel.find(filter)
    .sort({ _id: -1 })
    .limit(input.limit + 1)
    .lean();
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    items: page.map((row) => ({
      id: String(row._id),
      kind: row.kind,
      job_id: String(row.jobId),
      attempts: row.attempts,
      error: row.error,
      failed_at: row.failedAt,
      replayed_at: row.replayedAt ?? null,
    })),
    next_cursor: hasMore ? String(page[page.length - 1]._id) : null,
  };
};

// Re-queues a failed dead-letter background job with an initialized attempt budget.
// Uses atomic state locking to prevent concurrent administrators from replaying the same job.
// Re-triggers optimization flows or resets underlying job records to queued status.
export const replayDeadLetterJob = async (input: { id: string; orgId: string; userId: string }) => {
  const orgObjectId = new mongoose.Types.ObjectId(input.orgId);
  const entry: any = await DeadLetterJobModel.findOne({ _id: input.id, orgId: orgObjectId }).lean();
  if (!entry) throw new HttpError(404, "DEAD_LETTER_NOT_FOUND", "Dead-letter job not found");
  if (entry.replayedAt) throw new HttpError(409, "DEAD_LETTER_ALREADY_REPLAYED", "Dead-letter job was already replayed");

  // Claim the replay atomically so two admins cannot replay the same row.
  const claimed = await DeadLetterJobModel.findOneAndUpdate(
    { _id: input.id, orgId: orgObjectId, replayedAt: { $exists: false } },
    { $set: { replayedAt: new Date(), replayedBy: new mongoose.Types.ObjectId(input.userId) } },
    { new: true }
  ).lean();
  if (!claimed) throw new HttpError(409, "DEAD_LETTER_ALREADY_REPLAYED", "Dead-letter job was already replayed");

  if (entry.kind === "ai_optimize") {
    const result = await runOptimizeForOrg(String(entry.jobId));
    if (result.outcome === "failed") {
      await DeadLetterJobModel.updateOne({ _id: input.id }, { $unset: { replayedAt: "", replayedBy: "" }, $set: { error: String(result.error ?? "").slice(0, 2000) } });
      throw new HttpError(502, "REPLAY_FAILED", "Optimizer replay failed", { error: result.error });
    }
    return { id: input.id, kind: entry.kind, outcome: result.outcome };
  }

  const model = retryableJobModel(entry.kind);
  if (!model) {
    await DeadLetterJobModel.updateOne({ _id: input.id }, { $unset: { replayedAt: "", replayedBy: "" } });
    throw new HttpError(400, "DEAD_LETTER_KIND_UNSUPPORTED", `Replay is not supported for ${entry.kind}`);
  }

  const res = await model.updateOne(
    { _id: entry.jobId, orgId: orgObjectId, status: "failed" },
    {
      $set: { status: "queued", attempts: 0 },
      $unset: { nextAttemptAt: "", error: "", startedAt: "", finishedAt: "", ...(entry.kind === "integration_sync_run" ? { "metadata.quota_reservation": "" } : {}) },
    }
  );
  if (!res.modifiedCount) {
    await DeadLetterJobModel.updateOne({ _id: input.id }, { $unset: { replayedAt: "", replayedBy: "" } });
    throw new HttpError(409, "JOB_NOT_REPLAYABLE", "The original job is missing or no longer in a failed state");
  }
  return { id: input.id, kind: entry.kind, outcome: "requeued" as const };
};
