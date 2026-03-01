import { Queue, Worker } from "bullmq";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";

let _workflowQueue: Queue | null = null;

/**
 * Get or create the BullMQ workflow queue.
 * Returns `null` if REDIS_URL is not configured — callers must fall back to p-queue.
 */
export const getWorkflowQueue = (): Queue | null => {
  if (_workflowQueue) return _workflowQueue;

  const env = getEnv();
  if (!env.REDIS_URL) return null;

  try {
    _workflowQueue = new Queue("workflow-runs", {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    _workflowQueue.on("error", (err) =>
      logger.warn({ err: err.message, event: "bullmq_queue_error" }, "BullMQ queue error")
    );

    logger.info({ event: "bullmq_queue_ready" }, "BullMQ workflow queue initialized");
  } catch (error) {
    logger.warn({ error, event: "bullmq_init_failed" }, "BullMQ init failed; using p-queue fallback");
    return null;
  }

  return _workflowQueue;
};

/**
 * Enqueue a workflow run for processing.
 * Falls back gracefully if Redis/BullMQ is unavailable — returns `{ fallback: true }`.
 */
export const enqueueWorkflowRun = async (
  workflowId: string,
  orgId: string,
): Promise<{ fallback: boolean }> => {
  const q = getWorkflowQueue();
  if (!q) return { fallback: true };

  try {
    await q.add(
      "run",
      { workflowId, orgId },
      { jobId: `${workflowId}-${Date.now()}` },
    );
    return { fallback: false };
  } catch (error) {
    logger.warn({ error, workflowId, event: "bullmq_enqueue_failed" }, "Failed to enqueue workflow");
    return { fallback: true };
  }
};

/**
 * Start a BullMQ worker that processes workflow-run jobs.
 * Returns a cleanup function, or `null` if Redis is unavailable.
 */
export const startBullWorker = (
  processJob: (workflowId: string, orgId: string) => Promise<void>,
): (() => Promise<void>) | null => {
  const env = getEnv();
  if (!env.REDIS_URL) return null;

  try {
    const worker = new Worker(
      "workflow-runs",
      async (job) => {
        const { workflowId, orgId } = job.data as { workflowId: string; orgId: string };
        logger.info({ jobId: job.id, workflowId, event: "bullmq_job_start" }, "Processing workflow run");
        await processJob(workflowId, orgId);
      },
      {
        connection: { url: env.REDIS_URL },
        concurrency: 5,
      },
    );

    worker.on("failed", (job, err) => {
      logger.error(
        { jobId: job?.id, err: err.message, event: "bullmq_job_failed" },
        "Workflow job failed",
      );
    });

    worker.on("completed", (job) => {
      logger.info({ jobId: job.id, event: "bullmq_job_completed" }, "Workflow job completed");
    });

    logger.info({ event: "bullmq_worker_started", concurrency: 5 }, "BullMQ worker started");

    return async () => {
      await worker.close();
      logger.info({ event: "bullmq_worker_stopped" }, "BullMQ worker stopped");
    };
  } catch (error) {
    logger.warn({ error, event: "bullmq_worker_init_failed" }, "BullMQ worker init failed");
    return null;
  }
};

/**
 * Close the shared queue connection.
 */
export const closeQueue = async (): Promise<void> => {
  if (_workflowQueue) {
    try {
      await _workflowQueue.close();
    } catch {
      // ignore
    }
    _workflowQueue = null;
  }
};
