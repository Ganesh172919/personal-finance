/**
 * @fileoverview Retry / backoff / dead-letter policy for queued background jobs
 * (workflow_run, integration_sync_run, export_job).
 *
 * Lifecycle: queued -> running -> (success | failure). A failure (processor threw, or a stale
 * `running` job swept by the visibility timeout) counts as one attempt:
 *   attempts < max  -> status back to `queued` with `nextAttemptAt = now + exponential backoff + jitter`
 *   attempts >= max -> status `failed` and a persistent row in `dead_letter_jobs` (admin replay).
 *
 * Env (read lazily): WORKER_JOB_MAX_ATTEMPTS (3), WORKER_JOB_BACKOFF_BASE_MS (5000),
 * WORKER_JOB_BACKOFF_MAX_MS (300000).
 */
import type { Model } from "mongoose";
import mongoose from "mongoose";

import { logger } from "../config/logger";
import DeadLetterJobModel, { type DeadLetterJobKind } from "../models/deadLetterJobModel";
import ExportJobModel from "../models/exportJobModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import WorkflowRunModel from "../models/workflowRunModel";

// Enumerates background task entity types supported by the retry subsystem.
// Identifies workflow executions, integration synchronizations, and data exports.
// Scopes retry policies and dead-letter queue records to known task kinds.
export type RetryableJobKind = "workflow_run" | "integration_sync_run" | "export_job";

// Configuration specifications controlling job retry limits and delays.
// Defines maximum execution attempts alongside base and ceiling backoff intervals.
// Enforces exponential backoff parameters across asynchronous task workers.
export interface JobRetryConfig {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
}

// Parses integer values safely from process environment variable strings.
// Validates parsed numbers against minimum boundaries and applies fallbacks.
// Guarantees reliable numerical configuration parameters for worker timeouts.
const intEnv = (name: string, fallback: number, min: number) => {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

// Resolves the runtime retry configuration from environment variables.
// Pulls maximum attempts, backoff baselines, and maximum delay ceilings.
// Provides standardized configuration objects for task retry schedulers.
export const getJobRetryConfig = (): JobRetryConfig => ({
  maxAttempts: intEnv("WORKER_JOB_MAX_ATTEMPTS", 3, 1),
  baseMs: intEnv("WORKER_JOB_BACKOFF_BASE_MS", 5_000, 0),
  maxMs: intEnv("WORKER_JOB_BACKOFF_MAX_MS", 300_000, 0),
});

/** Exponential backoff with "equal jitter": half deterministic, half random (spreads retry storms). */
// Calculates exponential backoff duration with equal randomized jitter.
// Blends deterministic exponential doubling with uniform random intervals.
// Mitigates thundering herd problems when multiple failed jobs retry simultaneously.
export const computeBackoffMs = (
  attempt: number,
  config: Pick<JobRetryConfig, "baseMs" | "maxMs"> = getJobRetryConfig(),
  random: () => number = Math.random
): number => {
  const exp = Math.min(config.maxMs, config.baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
};

const PERMANENT_ERROR = /not found|invalid|unsupported|requires|missing|disabled|forbidden|unauthori[sz]ed/i;

/** Validation-style failures will not succeed on retry; everything else (timeouts, 5xx, crashes) will. */
// Determines whether a task failure represents a transient, retryable error.
// Inspects HTTP status codes and filters out permanent client or auth errors.
// Enables automatic re-execution for network timeouts, crashes, and 5xx errors.
export const isRetryableJobError = (error: unknown): boolean => {
  const status = Number((error as any)?.statusCode ?? (error as any)?.status);
  if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return !PERMANENT_ERROR.test(String((error as any)?.message ?? error ?? ""));
};

const MODELS: Record<RetryableJobKind, Model<any>> = {
  workflow_run: WorkflowRunModel as unknown as Model<any>,
  integration_sync_run: IntegrationSyncRunModel as unknown as Model<any>,
  export_job: ExportJobModel as unknown as Model<any>,
};

// Resolves the associated Mongoose data model for a retryable job kind.
// Maps task discriminator strings to their corresponding database collections.
// Returns the model instance or null if the job kind is unrecognized.
export const retryableJobModel = (kind: string): Model<any> | null => (MODELS as Record<string, Model<any>>)[kind] ?? null;

// Standardized outcome statuses resulting from registering a job failure.
// Distinguishes between requeued retries, dead-letter transfers, and skipped jobs.
// Communicates disposition states back to monitoring sweepers and workers.
export type JobFailureOutcome = "requeued" | "dead_lettered" | "skipped";

/** Persists a dead-letter row (idempotent per kind+jobId). */
// Records an exhausted or unrecoverable failed task into the dead-letter queue.
// Persists error messages, attempt counts, and payloads idempotently.
// Enables administrative inspection and manual job replaying capabilities.
export const writeDeadLetter = async (input: {
  kind: DeadLetterJobKind;
  jobId: mongoose.Types.ObjectId | string;
  orgId?: mongoose.Types.ObjectId | string | null;
  attempts: number;
  error: string;
  payload?: Record<string, unknown>;
}) => {
  const jobId = new mongoose.Types.ObjectId(String(input.jobId));
  await DeadLetterJobModel.updateOne(
    { kind: input.kind, jobId },
    {
      $set: {
        attempts: input.attempts,
        error: input.error.slice(0, 2000),
        failedAt: new Date(),
        ...(input.orgId ? { orgId: new mongoose.Types.ObjectId(String(input.orgId)) } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
      },
      $unset: { replayedAt: "", replayedBy: "" },
    },
    { upsert: true }
  );
};

/**
 * Registers one failed attempt for a job that is `running` (processor threw / crashed) or already
 * marked `failed` by its processor. Safe to call from several replicas: the attempt counter is
 * incremented atomically and the requeue is a compare-and-set on that counter.
 */
// Atomically records a job failure attempt and decides requeue or dead-letter.
// Applies exponential backoff when attempts remain within configured limits.
// Writes to dead-letter storage and transitions status to failed when exhausted.
export const registerJobFailure = async (
  kind: RetryableJobKind,
  id: string,
  error: unknown,
  options: { retryable?: boolean; config?: JobRetryConfig; random?: () => number } = {}
): Promise<JobFailureOutcome> => {
  const model = MODELS[kind];
  const config = options.config ?? getJobRetryConfig();
  const message = String((error as any)?.message ?? error ?? "Job failed").slice(0, 2000);

  const doc: any = await model
    .findOneAndUpdate({ _id: id, status: { $in: ["running", "failed"] } }, { $inc: { attempts: 1 } }, { new: true })
    .select({ _id: 1, orgId: 1, attempts: 1, error: 1 })
    .lean();
  if (!doc) return "skipped";

  const attempts = Number(doc.attempts ?? 1);
  const retryable = (options.retryable ?? isRetryableJobError(error)) && attempts < config.maxAttempts;

  if (retryable) {
    const delay = computeBackoffMs(attempts, config, options.random);
    const update: Record<string, any> = {
      $set: { status: "queued", nextAttemptAt: new Date(Date.now() + delay), error: message.slice(0, 400) },
      $unset: { startedAt: "", finishedAt: "", ...(kind === "integration_sync_run" ? { "metadata.quota_reservation": "" } : {}) },
    };
    const res = await model.updateOne({ _id: id, status: { $in: ["running", "failed"] }, attempts }, update);
    if (res.modifiedCount) {
      logger.warn({ event: "job_requeued", kind, job_id: id, attempts, retry_in_ms: delay }, "Job failed; requeued with backoff");
      return "requeued";
    }
    return "skipped";
  }

  await model.updateOne(
    { _id: id, status: { $in: ["running", "failed"] } },
    { $set: { status: "failed", finishedAt: new Date(), error: message.slice(0, 400) } }
  );
  await writeDeadLetter({ kind, jobId: id, orgId: doc.orgId, attempts, error: message });
  logger.error({ event: "job_dead_lettered", kind, job_id: id, attempts }, "Job exhausted retries; moved to dead-letter collection");
  return "dead_lettered";
};

/** Claim filter shared by the worker: queued and not waiting on a backoff. */
// Generates a MongoDB query filter for acquiring claimable queued jobs.
// Matches queued jobs whose next scheduled attempt timestamp has passed.
// Prevents premature execution of tasks currently undergoing backoff delays.
export const claimableQueuedFilter = (now = new Date()) => ({ status: "queued", nextAttemptAt: { $not: { $gt: now } } });
