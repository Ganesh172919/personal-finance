import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import WorkflowModel from "../models/workflowModel";
import { QUEUE_NAMES, getQueue } from "./queues";

export const ensureRepeatableJobs = async () => {
  const env = getEnv();
  if (!env.REDIS_URL || !env.WORKER_ENABLED) {
    return { scheduled: false };
  }

  const usageAggregationCron = env.USAGE_AGGREGATION_CRON || "0 * * * *";
  const digestCron = env.DIGEST_EMAIL_CRON || "0 8 * * *";

  const usageQueue = getQueue(QUEUE_NAMES.usageAggregation);
  const digestQueue = getQueue(QUEUE_NAMES.digestEmail);
  const workflowQueue = getQueue(QUEUE_NAMES.workflowEval);
  const domainEventsQueue = getQueue(QUEUE_NAMES.domainEvents);

  await usageQueue.add(
    "usage-aggregation",
    {},
    {
      jobId: "usage-aggregation:repeat",
      repeat: { pattern: usageAggregationCron },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  await digestQueue.add(
    "digest-scan",
    { daysBack: env.DIGEST_EMAIL_DAYS_BACK },
    {
      jobId: "digest-scan:repeat",
      repeat: { pattern: digestCron },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  await domainEventsQueue.add(
    "domain-event-scan",
    { limit: 200 },
    {
      jobId: "domain-event-scan:repeat",
      repeat: { pattern: "*/1 * * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  logger.info(
    {
      event: "worker_repeatable_jobs_scheduled",
      usage_aggregation_cron: usageAggregationCron,
      digest_cron: digestCron,
      digest_days_back: env.DIGEST_EMAIL_DAYS_BACK,
    },
    "scheduled repeatable worker jobs"
  );

  const existing = await workflowQueue.getRepeatableJobs();
  let removed = 0;
  for (const job of existing) {
    if (job?.name !== "workflow-cron") continue;
    try {
      await workflowQueue.removeRepeatableByKey(job.key);
      removed += 1;
    } catch {
      // ignore
    }
  }

  const workflows = await WorkflowModel.find({
    enabled: true,
    "trigger.type": "cron",
    "trigger.cron": { $type: "string", $ne: "" },
  })
    .select({ _id: 1, trigger: 1 })
    .lean();

  let cronScheduled = 0;
  for (const workflow of workflows) {
    const cron = String((workflow as any)?.trigger?.cron || "").trim();
    if (!cron) continue;

    const workflowId = String((workflow as any)._id);
    await workflowQueue.add(
      "workflow-cron",
      { workflowId },
      {
        jobId: `wf_cron:${workflowId}`,
        repeat: { pattern: cron },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    cronScheduled += 1;
  }

  logger.info(
    {
      event: "workflow_cron_scheduled",
      repeatable_removed: removed,
      workflows_scheduled: cronScheduled,
    },
    "scheduled workflow cron repeatable jobs"
  );

  return { scheduled: true };
};
