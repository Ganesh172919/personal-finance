/**
 * @fileoverview Background Worker Process
 *
 * This is a separate Node.js process that handles asynchronous background jobs.
 * It runs independently from the main Express server and processes jobs from
 * MongoDB collections through a custom, MongoDB-backed job queue.
 *
 * ARCHITECTURE:
 * - Main server (server.ts): Handles HTTP requests, can also process jobs when ASYNC_JOBS_ENABLED=false
 * - Worker (worker.ts): Dedicated job processor, started when ASYNC_JOBS_ENABLED=true
 *
 * JOB TYPES:
 * 1. workflow_run: Executes automated financial workflows (scheduled tasks)
 * 2. integration_sync_run: Syncs data from external integrations (bank connections)
 * 3. export_job: Generates financial data exports (CSV, PDF)
 *
 * JOB CLAIMING PATTERN:
 * Uses MongoDB's findOneAndUpdate with atomic status transition:
 * 1. Find a job with status="queued"
 * 2. Atomically set status="running" (prevents duplicate processing)
 * 3. Process the job
 * 4. Set status="completed" or "failed"
 *
 * ROUND-ROBIN SCHEDULING:
 * The worker uses a cursor-based round-robin approach to fairly distribute
 * processing across job types. This prevents one job type from starving others.
 *
 * CONCURRENCY:
 * Uses p-queue to limit concurrent job processing. The concurrency limit is
 * configurable via WORKER_CONCURRENCY (default: 4).
 *
 * @module worker
 */

import { randomUUID } from "crypto";
import PQueue from "p-queue"; // Promise-based concurrency limiter

import ExportJobModel from "../models/exportJobModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { connectDBStrict, closeDB } from "../config/database";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import { processExportJob } from "../services/exports";
import { processIntegrationSyncRun } from "../services/integrations";
import { processWorkflowRun } from "../services/workflows";
import { startWorkflowScheduler } from "../services/workflowScheduler";
import { recoverStaleJobs } from "../services/jobRecovery";
import { claimableQueuedFilter, registerJobFailure } from "../services/jobRetry";
import { startAiOptimizeScheduler } from "../services/aiOptimizeScheduler";
import ScheduledExportModel from "../models/scheduledExportModel";
import { computeNextRunDate, executeScheduledExport } from "../services/scheduledExportService";

// Discriminated union type for all job kinds
// Each job has a 'kind' discriminator and the job document's MongoDB _id
// Discriminated union typing background jobs processed by the worker daemon.
// Encapsulates job kind classification and MongoDB document ObjectId.
// Discriminates between workflow runs, integration syncs, export jobs, and scheduled exports.
type WorkerJob =
  | { kind: "workflow_run"; id: string }
  | { kind: "integration_sync_run"; id: string }
  | { kind: "export_job"; id: string }
  | { kind: "scheduled_export"; id: string };

// Unique ID for this worker instance (for log correlation)
const instanceId = randomUUID();
// Child logger with worker-specific context
const workerLogger = logger.child({ service: "worker", instance_id: instanceId });

// All supported job kinds (used for round-robin scheduling)
const jobKinds: WorkerJob["kind"][] = ["workflow_run", "integration_sync_run", "export_job", "scheduled_export"];
// Cursor for round-robin job claiming (persists across ticks)
let claimCursor = 0;

/**
 * Atomically claims a workflow run job from the queue.
 *
 * Uses MongoDB's findOneAndUpdate for atomic status transition:
 * - Finds a job with status="queued"
 * - Sets status="running" (atomic — prevents duplicate claims)
 * - Sorts by createdAt (FIFO — oldest jobs first)
 * - Returns the claimed job's _id
 *
 * @returns Claimed job or null if no jobs available
 */
// Atomically claims the oldest claimable workflow execution run from MongoDB.
// Filters queued jobs respecting exponential backoff and transitions status to running.
// Returns job descriptor object or null when no workflow jobs are ready.
const claimWorkflowRun = async (): Promise<WorkerJob | null> => {
  const claimed = await WorkflowRunModel.findOneAndUpdate(
    claimableQueuedFilter(),  // Only claim queued jobs whose backoff has elapsed
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }  // Oldest first, return updated doc
  )
    .select({ _id: 1 })  // Only fetch _id (minimize data transfer)
    .lean();              // Return plain object (faster than Mongoose document)

  if (!claimed?._id) return null;
  return { kind: "workflow_run", id: String(claimed._id) };
};

/**
 * Atomically claims an integration sync run job from the queue.
 * Same pattern as claimWorkflowRun but for integration sync jobs.
 */
// Atomically transitions queued integration synchronization job to running status.
// Uses findOneAndUpdate with sort by createdAt to guarantee FIFO execution.
// Prevents duplicate processing across multiple distributed worker processes.
const claimIntegrationSyncRun = async (): Promise<WorkerJob | null> => {
  const claimed = await IntegrationSyncRunModel.findOneAndUpdate(
    claimableQueuedFilter(),
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }
  )
    .select({ _id: 1 })
    .lean();

  if (!claimed?._id) return null;
  return { kind: "integration_sync_run", id: String(claimed._id) };
};

/**
 * Atomically claims an export job from the queue.
 * Same pattern as claimWorkflowRun but for export jobs.
 */
// Atomically claims an asynchronous export job for CSV or PDF generation.
// Updates status to running, stamps execution start time, and clears previous errors.
// Minimizes network payload by projecting only the document identifier.
const claimExportJob = async (): Promise<WorkerJob | null> => {
  const claimed = await ExportJobModel.findOneAndUpdate(
    claimableQueuedFilter(),
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }
  )
    .select({ _id: 1 })
    .lean();

  if (!claimed?._id) return null;
  return { kind: "export_job", id: String(claimed._id) };
};

/** Claim one due scheduled export so multiple workers cannot deliver it twice. */
// Atomically claims a due scheduled export definition whose nextRunAt has arrived.
// Sets schedule status to running to ensure only one worker delivers the scheduled report.
// Orders candidate schedules by nextRunAt to deliver most overdue reports first.
const claimScheduledExport = async (): Promise<WorkerJob | null> => {
  const claimed = (await ScheduledExportModel.findOneAndUpdate(
    { status: "active", nextRunAt: { $lte: new Date() } },
    { $set: { status: "running" } },
    { sort: { nextRunAt: 1 }, new: true },
  )
    .select({ _id: 1 })
    .lean()) as { _id?: unknown } | null;

  if (!claimed?._id) return null;
  return { kind: "scheduled_export", id: String(claimed._id) };
};

/**
 * Routes job claiming to the appropriate model based on job kind.
 *
 * @param kind - The type of job to claim
 * @returns Claimed job or null
 */
// Routes job claiming requests to the appropriate claiming function based on kind.
// Dispatches to workflow run, integration sync, scheduled export, or export job models.
// Provides unified polymorphic claiming interface for round-robin dispatchers.
const claimJobForKind = async (kind: WorkerJob["kind"]): Promise<WorkerJob | null> => {
  if (kind === "workflow_run") return claimWorkflowRun();
  if (kind === "integration_sync_run") return claimIntegrationSyncRun();
  if (kind === "scheduled_export") return claimScheduledExport();
  return claimExportJob();
};

/**
 * Claims the next available job using round-robin scheduling.
 *
 * ROUND-ROBIN ALGORITHM:
 * - Starts at the current cursor position
 * - Tries each job kind in order
 * - Returns the first available job
 * - Advances the cursor past the claimed job's kind
 *
 * This prevents one job type from monopolizing the worker.
 * For example, if there are 100 export jobs and 1 workflow run,
 * the workflow run won't be starved.
 *
 * @returns Claimed job or null if no jobs available
 */
// Implements round-robin job claiming across all supported queue collections.
// Advances cursor across job categories to prevent high-volume queues from starving others.
// Returns the first successfully claimed job or null if all queues are idle.
const claimNextJob = async (): Promise<WorkerJob | null> => {
  for (let offset = 0; offset < jobKinds.length; offset += 1) {
    const kind = jobKinds[(claimCursor + offset) % jobKinds.length]!;
    const claimed = await claimJobForKind(kind);
    if (claimed) {
      // Advance cursor past the claimed job's kind
      claimCursor = (claimCursor + offset + 1) % jobKinds.length;
      return claimed;
    }
  }
  return null;
};

/**
 * Executes a claimed job by routing to the appropriate processor.
 *
 * Each job kind has its own processor function that handles the actual work.
 * Errors are caught and logged (not re-thrown) to prevent the worker from crashing.
 *
 * @param job - The job to execute
 */
// Executes the business logic for a claimed job according to its kind discriminator.
// Dispatches to export processor, integration sync worker, or workflow engine.
// Captures failures, records backoff retry schedules, and registers dead-letter jobs.
const executeJob = async (job: WorkerJob) => {
  const startedAt = Date.now();
  try {
    // Route to the appropriate processor based on job kind
    if (job.kind === "scheduled_export") {
      try {
        await executeScheduledExport(job.id);
        await ScheduledExportModel.updateOne(
          { _id: job.id, status: "running" },
          { $set: { status: "active" } },
        );
      } catch (error) {
        const schedule = await ScheduledExportModel.findOne({ _id: job.id, status: "running" });
        if (schedule) {
          schedule.lastRunAt = new Date();
          schedule.lastDeliveryStatus = "failed";
          schedule.lastError = error instanceof Error ? error.message : "Scheduled export delivery failed";
          schedule.nextRunAt = computeNextRunDate(schedule.frequency, schedule.lastRunAt);
          schedule.status = "active";
          await schedule.save();
        }
        throw error;
      }
    } else if (job.kind === "workflow_run") {
      await processWorkflowRun(job.id);
    } else if (job.kind === "integration_sync_run") {
      await processIntegrationSyncRun(job.id);
    } else {
      await processExportJob(job.id);
    }

    workerLogger.info({ job, duration_ms: Date.now() - startedAt }, "Job processed");
  } catch (error) {
    // Log but don't re-throw — the worker should continue processing other jobs
    workerLogger.warn({ error, job, duration_ms: Date.now() - startedAt }, "Job failed");
    // Count the attempt: requeue with exponential backoff, or dead-letter after max attempts.
    if (job.kind !== "scheduled_export") {
      await registerJobFailure(job.kind, job.id, error).catch((retryError) =>
        workerLogger.error({ error: retryError, job }, "Failed to register job failure")
      );
    }
  }
};

// ── Module-Level State ────────────────────────────────────────────────
let shuttingDown = false;                        // Guard flag for graceful shutdown
let tickTimer: NodeJS.Timeout | null = null;     // Polling interval handle
let workflowSchedulerStop: (() => void) | null = null; // Workflow scheduler stop function
let aiOptimizeStop: (() => void) | null = null;        // Nightly AI optimizer stop function

// Recovers orphaned scheduled exports locked in running status longer than 30 minutes.
// Resets status back to active to allow healthy worker instances to retry execution.
// Protects against permanent job hangs caused by abrupt process restarts or server crashes.
const recoverStaleScheduledExports = async () => {
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
  const result = await ScheduledExportModel.updateMany(
    { status: "running", updatedAt: { $lt: staleBefore } },
    { $set: { status: "active" } },
  );
  if (result.modifiedCount > 0) {
    workerLogger.warn({ recovered: result.modifiedCount }, "Recovered stale scheduled export deliveries");
  }
};

/**
 * Gracefully shuts down the worker process.
 *
 * Shutdown sequence:
 * 1. Stop the polling timer
 * 2. Stop the workflow scheduler
 * 3. Wait for all running jobs to complete (queue.onIdle())
 * 4. Close the database connection
 * 5. Exit the process
 *
 * @param reason - The signal or event that triggered shutdown
 * @param exitCode - Process exit code
 * @param queue - The PQueue instance to wait for
 */
// Coordinates graceful termination sequence for the background worker daemon.
// Cancels polling timers, waits for in-flight jobs to finish, and closes MongoDB connections.
// Enforces a 15-second unref timeout safety net to guarantee process exit.
const shutdown = async (reason: string, exitCode = 0, queue?: PQueue) => {
  if (shuttingDown) return;
  shuttingDown = true;

  workerLogger.info({ reason }, "Starting graceful shutdown");

  // Stop the polling timer
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }

  // Stop the workflow scheduler
  if (workflowSchedulerStop) {
    workflowSchedulerStop();
    workflowSchedulerStop = null;
  }

  if (aiOptimizeStop) {
    aiOptimizeStop();
    aiOptimizeStop = null;
  }

  // Safety net: force exit after 15 seconds
  const forceExitTimer = setTimeout(() => {
    workerLogger.error({ reason }, "Graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    // Wait for all running jobs to complete
    if (queue) {
      await queue.onIdle();
    }
    // Close database connection
    await closeDB();
    workerLogger.info("Shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    workerLogger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
};

/**
 * Main worker startup function.
 *
 * STARTUP SEQUENCE:
 * 1. Check if async jobs are enabled (exit if not)
 * 2. Connect to MongoDB (strict mode — no in-memory fallback)
 * 3. Create a concurrency-limited job queue
 * 4. Start the workflow scheduler
 * 5. Begin the polling loop
 * 6. Register signal handlers for graceful shutdown
 */
// Main initialization lifecycle for the asynchronous background job worker process.
// Connects to MongoDB, triggers stale job recovery sweeps, and starts workflow schedulers.
// Initiates the polling loop with concurrency limits governed by PQueue.
async function start() {
  const env = getEnv();

  // Exit immediately if async jobs are not enabled
  // The main server will handle jobs inline when ASYNC_JOBS_ENABLED=false
  if (!env.ASYNC_JOBS_ENABLED) {
    workerLogger.warn(
      { ASYNC_JOBS_ENABLED: env.ASYNC_JOBS_ENABLED },
      "Worker is disabled (ASYNC_JOBS_ENABLED=false). Exiting."
    );
    process.exit(0);
  }

  // Connect to MongoDB (strict mode: requires MONGO_URI, no in-memory fallback)
  await connectDBStrict();

  // Run initial sweep to recover any jobs abandoned during previous process termination
  await recoverStaleJobs().catch((err) =>
    workerLogger.warn({ err }, "Initial stale job recovery sweep encountered an error")
  );
  await recoverStaleScheduledExports().catch((err) =>
    workerLogger.warn({ err }, "Initial scheduled export recovery sweep encountered an error")
  );

  // Create a concurrency-limited promise queue
  // This limits how many jobs can run in parallel
  const queue = new PQueue({ concurrency: env.WORKER_CONCURRENCY });

  // Start the workflow scheduler (cron-like scheduled workflows)
  if (env.NODE_ENV !== "test") {
    workflowSchedulerStop = startWorkflowScheduler({ label: "worker" }).stop;
    aiOptimizeStop = startAiOptimizeScheduler().stop;
  }

  workerLogger.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      poll_interval_ms: env.WORKER_POLL_INTERVAL_MS,
      mongo_uri_configured: Boolean(env.MONGO_URI),
    },
    "Worker started"
  );

  let lastRecoveryAt = Date.now();

  /**
   * Single polling tick: claims and queues up to `capacity` jobs.
   *
   * CAPACITY CALCULATION:
   * capacity = max_concurrency - (pending_jobs + queued_jobs)
   * This ensures we don't overload the queue.
   */
  const tick = async () => {
    if (shuttingDown) return;

    // Periodic sweep for stale/crashed jobs every 5 minutes
    if (Date.now() - lastRecoveryAt > 5 * 60 * 1000) {
      lastRecoveryAt = Date.now();
      void recoverStaleJobs().catch((err) =>
        workerLogger.warn({ err }, "Periodic stale job recovery sweep failed")
      );
      void recoverStaleScheduledExports().catch((err) =>
        workerLogger.warn({ err }, "Periodic scheduled export recovery sweep failed")
      );
    }

    try {
      // Calculate available capacity
      const capacity = Math.max(0, env.WORKER_CONCURRENCY - (queue.pending + queue.size));
      if (capacity <= 0) {
        return; // Queue is full, skip this tick
      }

      // Claim and queue jobs up to capacity
      for (let i = 0; i < capacity; i += 1) {
        const job = await claimNextJob();
        if (!job) break; // No more jobs available
        // void: fire-and-forget (job runs asynchronously in the queue)
        void queue.add(() => executeJob(job));
      }
    } catch (error) {
      workerLogger.error({ error }, "Worker tick failed");
    }
  };

  /**
   * Schedules the next polling tick using setTimeout.
   * Uses recursive setTimeout instead of setInterval for better control
   * (prevents overlapping ticks if one takes longer than the interval).
   */
  const scheduleTick = () => {
    if (shuttingDown) return;
    tickTimer = setTimeout(async () => {
      await tick();
      scheduleTick(); // Schedule the next tick
    }, env.WORKER_POLL_INTERVAL_MS);
    tickTimer.unref(); // Don't prevent process exit
  };

  // Start the polling loop
  scheduleTick();

  // ── Signal Handlers ──────────────────────────────────────────────
  process.once("SIGINT", () => {
    void shutdown("SIGINT", 0, queue);
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 0, queue);
  });

  process.once("uncaughtException", error => {
    workerLogger.error({ error }, "Uncaught exception");
    void shutdown("uncaughtException", 1, queue);
  });

  process.once("unhandledRejection", reason => {
    workerLogger.error({ reason }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1, queue);
  });
}

// ── Entry Point ───────────────────────────────────────────────────────
// Worker daemon process entrypoint with top-level error capture.
// Invokes the asynchronous start sequence and traps unhandled fatal startup failures.
// Terminates process with non-zero exit code if worker bootstrapping fails.
start().catch(error => {
  workerLogger.error({ error }, "Failed to start worker");
  process.exit(1);
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Atomic Job Claiming**: Using MongoDB's findOneAndUpdate ensures that
 *    two workers can't claim the same job simultaneously. This is critical
 *    for distributed job processing.
 *
 * 2. **Round-Robin Fairness**: The cursor-based round-robin prevents job
 *    starvation. Even if one queue has thousands of jobs, other job types
 *    get fair access.
 *
 * 3. **Recursive setTimeout vs setInterval**: The tick loop uses recursive
 *    setTimeout to prevent overlapping ticks. If a tick takes longer than
 *    the interval, the next tick starts after it completes (not during).
 *
 * 4. **PQueue for Concurrency Control**: p-queue limits parallel job execution
 *    to prevent resource exhaustion (CPU, memory, database connections).
 *
 * 5. **Graceful Shutdown**: The worker waits for running jobs to complete
 *    before exiting. This prevents data corruption from half-finished jobs.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * worker.ts → runs as a separate process (node worker.ts)
 * worker.ts → claims jobs from MongoDB collections
 * worker.ts → delegates to services (exports, integrations, workflows)
 * worker.ts → shares database with the main Express server
 * ══════════════════════════════════════════════════════════════════════
 */
