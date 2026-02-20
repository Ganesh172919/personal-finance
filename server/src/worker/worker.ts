import { randomUUID } from "crypto";
import PQueue from "p-queue";

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

type WorkerJob =
  | { kind: "workflow_run"; id: string }
  | { kind: "integration_sync_run"; id: string }
  | { kind: "export_job"; id: string };

const instanceId = randomUUID();
const workerLogger = logger.child({ service: "worker", instance_id: instanceId });

const jobKinds: WorkerJob["kind"][] = ["workflow_run", "integration_sync_run", "export_job"];
let claimCursor = 0;

const claimWorkflowRun = async (): Promise<WorkerJob | null> => {
  const claimed = await WorkflowRunModel.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }
  )
    .select({ _id: 1 })
    .lean();

  if (!claimed?._id) return null;
  return { kind: "workflow_run", id: String(claimed._id) };
};

const claimIntegrationSyncRun = async (): Promise<WorkerJob | null> => {
  const claimed = await IntegrationSyncRunModel.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }
  )
    .select({ _id: 1 })
    .lean();

  if (!claimed?._id) return null;
  return { kind: "integration_sync_run", id: String(claimed._id) };
};

const claimExportJob = async (): Promise<WorkerJob | null> => {
  const claimed = await ExportJobModel.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "running", startedAt: new Date() }, $unset: { finishedAt: "", error: "" } },
    { sort: { createdAt: 1 }, new: true }
  )
    .select({ _id: 1 })
    .lean();

  if (!claimed?._id) return null;
  return { kind: "export_job", id: String(claimed._id) };
};

const claimJobForKind = async (kind: WorkerJob["kind"]): Promise<WorkerJob | null> => {
  if (kind === "workflow_run") return claimWorkflowRun();
  if (kind === "integration_sync_run") return claimIntegrationSyncRun();
  return claimExportJob();
};

const claimNextJob = async (): Promise<WorkerJob | null> => {
  for (let offset = 0; offset < jobKinds.length; offset += 1) {
    const kind = jobKinds[(claimCursor + offset) % jobKinds.length]!;
    const claimed = await claimJobForKind(kind);
    if (claimed) {
      claimCursor = (claimCursor + offset + 1) % jobKinds.length;
      return claimed;
    }
  }
  return null;
};

const executeJob = async (job: WorkerJob) => {
  const startedAt = Date.now();
  try {
    if (job.kind === "workflow_run") {
      await processWorkflowRun(job.id);
    } else if (job.kind === "integration_sync_run") {
      await processIntegrationSyncRun(job.id);
    } else {
      await processExportJob(job.id);
    }

    workerLogger.info({ job, duration_ms: Date.now() - startedAt }, "Job processed");
  } catch (error) {
    workerLogger.warn({ error, job, duration_ms: Date.now() - startedAt }, "Job failed");
  }
};

let shuttingDown = false;
let tickTimer: NodeJS.Timeout | null = null;
let workflowSchedulerStop: (() => void) | null = null;

const shutdown = async (reason: string, exitCode = 0, queue?: PQueue) => {
  if (shuttingDown) return;
  shuttingDown = true;

  workerLogger.info({ reason }, "Starting graceful shutdown");

  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }

  if (workflowSchedulerStop) {
    workflowSchedulerStop();
    workflowSchedulerStop = null;
  }

  const forceExitTimer = setTimeout(() => {
    workerLogger.error({ reason }, "Graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    if (queue) {
      await queue.onIdle();
    }
    await closeDB();
    workerLogger.info("Shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    workerLogger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
};

async function start() {
  const env = getEnv();

  if (!env.ASYNC_JOBS_ENABLED) {
    workerLogger.warn(
      { ASYNC_JOBS_ENABLED: env.ASYNC_JOBS_ENABLED },
      "Worker is disabled (ASYNC_JOBS_ENABLED=false). Exiting."
    );
    process.exit(0);
  }

  await connectDBStrict();

  const queue = new PQueue({ concurrency: env.WORKER_CONCURRENCY });

  if (env.NODE_ENV !== "test") {
    workflowSchedulerStop = startWorkflowScheduler({ label: "worker" }).stop;
  }

  workerLogger.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      poll_interval_ms: env.WORKER_POLL_INTERVAL_MS,
      mongo_uri_configured: Boolean(env.MONGO_URI),
    },
    "Worker started"
  );

  const tick = async () => {
    if (shuttingDown) return;

    try {
      const capacity = Math.max(0, env.WORKER_CONCURRENCY - (queue.pending + queue.size));
      if (capacity <= 0) {
        return;
      }

      for (let i = 0; i < capacity; i += 1) {
        const job = await claimNextJob();
        if (!job) break;
        void queue.add(() => executeJob(job));
      }
    } catch (error) {
      workerLogger.error({ error }, "Worker tick failed");
    }
  };

  const scheduleTick = () => {
    if (shuttingDown) return;
    tickTimer = setTimeout(async () => {
      await tick();
      scheduleTick();
    }, env.WORKER_POLL_INTERVAL_MS);
    tickTimer.unref();
  };

  scheduleTick();

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

start().catch(error => {
  workerLogger.error({ error }, "Failed to start worker");
  process.exit(1);
});
