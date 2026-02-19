import { Worker, type Job, type Processor } from "bullmq";

import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import { getBullMqConnection } from "./connection";
import { QUEUE_NAMES, type QueueName } from "./queues";
import mongoose from "mongoose";
import { getCurrentPeriodKey } from "../services/entitlements";
import { aggregateUsageLedger } from "../services/usageLedger";
import { processWorkflowRun } from "../services/workflows";
import { enqueueDigestJobsForAllOrgs, sendOrgDigestEmails } from "../services/digestService";
import { processExportJob } from "../services/exports";
import WorkflowModel from "../models/workflowModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { processDomainEventById, processPendingDomainEvents } from "../services/domainEventTriggers";
import { processIntegrationSyncRun } from "../services/integrations";

type WorkerHandle = {
  name: QueueName;
  worker: Worker;
};

const buildWorker = (params: {
  queueName: QueueName;
  processor: Processor;
  concurrency: number;
}) => {
  const env = getEnv();

  const worker = new Worker(params.queueName, params.processor, {
    connection: getBullMqConnection(),
    concurrency: params.concurrency,
  });

  worker.on("completed", (job) => {
    if (env.NODE_ENV !== "test") {
      logger.info(
        {
          event: "worker_job_completed",
          queue: params.queueName,
          job_id: job.id,
          job_name: job.name,
        },
        "worker job completed"
      );
    }
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        event: "worker_job_failed",
        queue: params.queueName,
        job_id: job?.id,
        job_name: job?.name,
        err: error,
      },
      "worker job failed"
    );
  });

  return worker;
};

export const startWorkers = async () => {
  const env = getEnv();
  const concurrency = env.WORKER_CONCURRENCY;

  const handles: WorkerHandle[] = [
    {
      name: QUEUE_NAMES.usageAggregation,
      worker: buildWorker({
        queueName: QUEUE_NAMES.usageAggregation,
        concurrency,
        processor: async (job: Job) => {
          const periodKeyRaw = job.data?.periodKey;
          const orgIdRaw = job.data?.orgId;
          const periodKey = typeof periodKeyRaw === "string" && periodKeyRaw.trim().length > 0 ? periodKeyRaw.trim() : getCurrentPeriodKey();
          const orgId =
            typeof orgIdRaw === "string" && mongoose.Types.ObjectId.isValid(orgIdRaw)
              ? new mongoose.Types.ObjectId(orgIdRaw)
              : undefined;

          logger.info(
            {
              event: "usage_aggregation_job_started",
              job_id: job.id,
              period_key: periodKey,
              org_id: orgId?.toString(),
            },
            "usage aggregation job started"
          );
          return aggregateUsageLedger({ orgId, periodKey });
        },
      }),
    },
    {
      name: QUEUE_NAMES.digestEmail,
      worker: buildWorker({
        queueName: QUEUE_NAMES.digestEmail,
        concurrency,
        processor: async (job: Job) => {
          const name = String(job.name || "");
          const asOfRaw = job.data?.asOf;
          const asOf = typeof asOfRaw === "string" ? new Date(asOfRaw) : undefined;

          logger.info(
            {
              event: "digest_email_job_started",
              job_id: job.id,
              job_name: name,
              org_id: job.data?.orgId,
            },
            "digest email job started"
          );

          if (name === "digest-scan") {
            const daysBackRaw = job.data?.daysBack;
            const periodKeyRaw = job.data?.periodKey;
            return enqueueDigestJobsForAllOrgs({
              asOf: asOf && !Number.isNaN(asOf.getTime()) ? asOf : undefined,
              daysBack: Number.isFinite(Number(daysBackRaw)) ? Number(daysBackRaw) : undefined,
              periodKey: typeof periodKeyRaw === "string" ? String(periodKeyRaw) : undefined,
            });
          }

          const orgIdRaw = String(job.data?.orgId || "").trim();
          if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
            return { ok: false, reason: "invalid_org_id" };
          }

          const periodKeyRaw = job.data?.periodKey;
          const daysBackRaw = job.data?.daysBack;

          return sendOrgDigestEmails({
            orgId: new mongoose.Types.ObjectId(orgIdRaw),
            asOf: asOf && !Number.isNaN(asOf.getTime()) ? asOf : undefined,
            daysBack: Number.isFinite(Number(daysBackRaw)) ? Number(daysBackRaw) : undefined,
            periodKey: typeof periodKeyRaw === "string" ? String(periodKeyRaw) : undefined,
          });
        },
      }),
    },
    {
      name: QUEUE_NAMES.workflowEval,
      worker: buildWorker({
        queueName: QUEUE_NAMES.workflowEval,
        concurrency,
        processor: async (job: Job) => {
          const name = String(job.name || "").trim();

          if (name === "workflow-cron") {
            const workflowIdRaw = String(job.data?.workflowId || "").trim();
            if (!workflowIdRaw || !mongoose.Types.ObjectId.isValid(workflowIdRaw)) {
              return { ok: false, reason: "invalid_workflow_id" };
            }

            const workflow = await WorkflowModel.findById(workflowIdRaw)
              .select({ _id: 1, orgId: 1, createdByUserId: 1, enabled: 1, trigger: 1 })
              .lean();

            if (!workflow || !(workflow as any).enabled || String((workflow as any)?.trigger?.type) !== "cron") {
              return { ok: true, skipped: true, reason: "workflow_disabled_or_missing" };
            }

            const idempotencyKey = `cron:${String(job.id || job.repeatJobKey || "")}`.slice(0, 128);

            const run =
              (await WorkflowRunModel.create({
                orgId: (workflow as any).orgId,
                workflowId: (workflow as any)._id,
                triggeredByUserId: (workflow as any).createdByUserId,
                status: "queued",
                idempotencyKey,
              }).catch(async (error: any) => {
                if (error?.code !== 11000) {
                  throw error;
                }
                const existing = await WorkflowRunModel.findOne({ workflowId: (workflow as any)._id, idempotencyKey });
                if (!existing) {
                  throw error;
                }
                return existing;
              })) as any;

            const workflowRunId = String(run._id);

            logger.info(
              {
                event: "workflow_cron_job_started",
                job_id: job.id,
                workflow_id: workflowIdRaw,
                workflow_run_id: workflowRunId,
              },
              "workflow cron job started"
            );

            const result = await processWorkflowRun(workflowRunId);
            return { ok: true, result };
          }

          const workflowRunId = String(job.data?.workflowRunId || "");
          if (!workflowRunId) {
            return { ok: false, reason: "missing_workflow_run_id" };
          }

          logger.info(
            {
              event: "workflow_eval_job_started",
              job_id: job.id,
              workflow_run_id: workflowRunId,
            },
            "workflow eval job started"
          );
          const result = await processWorkflowRun(workflowRunId);
          return { ok: true, result };
        },
      }),
    },
    {
      name: QUEUE_NAMES.exports,
      worker: buildWorker({
        queueName: QUEUE_NAMES.exports,
        concurrency,
        processor: async (job: Job) => {
          const exportJobId = String(job.data?.exportJobId || "");
          if (!exportJobId) {
            return { ok: false, reason: "missing_export_job_id" };
          }

          logger.info(
            {
              event: "export_job_started",
              job_id: job.id,
              export_job_id: exportJobId,
            },
            "export job started"
          );

          const result = await processExportJob(exportJobId);
          return { ok: true, result };
        },
      }),
    },
    {
      name: QUEUE_NAMES.domainEvents,
      worker: buildWorker({
        queueName: QUEUE_NAMES.domainEvents,
        concurrency,
        processor: async (job: Job) => {
          const name = String(job.name || "").trim();

          if (name === "domain-event-scan") {
            const limitRaw = job.data?.limit;
            return processPendingDomainEvents({
              limit: Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined,
            });
          }

          const domainEventId = String(job.data?.domainEventId || "").trim();
          if (!domainEventId) {
            return { ok: false, reason: "missing_domain_event_id" };
          }

          return processDomainEventById(domainEventId);
        },
      }),
    },
    {
      name: QUEUE_NAMES.integrationSync,
      worker: buildWorker({
        queueName: QUEUE_NAMES.integrationSync,
        concurrency,
        processor: async (job: Job) => {
          const runId = String(job.data?.integrationSyncRunId || "");
          if (!runId) {
            return { ok: false, reason: "missing_integration_sync_run_id" };
          }

          logger.info(
            {
              event: "integration_sync_job_started",
              job_id: job.id,
              integration_sync_run_id: runId,
            },
            "integration sync job started"
          );

          const result = await processIntegrationSyncRun(runId);
          return { ok: true, result };
        },
      }),
    },
  ];

  if (env.NODE_ENV !== "test") {
    logger.info(
      {
        event: "workers_started",
        queues: handles.map((h) => h.name),
        concurrency,
      },
      "workers started"
    );
  }

  const shutdown = async () => {
    await Promise.allSettled(handles.map((handle) => handle.worker.close()));
  };

  return {
    shutdown,
  };
};
