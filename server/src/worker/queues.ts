import { Queue } from "bullmq";

import { getBullMqConnection } from "./connection";

export const QUEUE_NAMES = {
  usageAggregation: "usage-aggregation",
  digestEmail: "digest-email",
  workflowEval: "workflow-eval",
  exports: "exports",
  domainEvents: "domain-events",
  aiEvals: "ai-evals",
  ocrFinalize: "ocr-finalize",
  integrationSync: "integration-sync",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<QueueName, Queue>();

export const getQueue = (name: QueueName): Queue => {
  const existing = queues.get(name);
  if (existing) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: getBullMqConnection(),
    defaultJobOptions: {
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5000 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 5000 },
    },
  });

  queues.set(name, queue);
  return queue;
};

export const closeQueues = async () => {
  const items = Array.from(queues.values());
  queues.clear();
  await Promise.allSettled(items.map((queue) => queue.close()));
};
