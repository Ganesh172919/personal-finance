import PQueue from "p-queue";
import { getEnv } from "../config/env";

const globalQueue = new PQueue({ concurrency: 8 });
const USER_QUEUE_IDLE_TTL_MS = 10 * 60 * 1000;

type UserQueueEntry = {
  queue: PQueue;
  lastUsedAt: number;
};

const perUserQueues = new Map<string, UserQueueEntry>();

const getOrCreateUserQueue = (userId: string, concurrency: number) => {
  const existing = perUserQueues.get(userId);
  if (existing) {
    existing.queue.concurrency = concurrency;
    existing.lastUsedAt = Date.now();
    return existing;
  }

  const entry: UserQueueEntry = {
    queue: new PQueue({ concurrency }),
    lastUsedAt: Date.now(),
  };
  perUserQueues.set(userId, entry);
  return entry;
};

const cleanupIdleUserQueues = () => {
  const now = Date.now();
  for (const [userId, entry] of perUserQueues.entries()) {
    const idleForMs = now - entry.lastUsedAt;
    const isIdle = entry.queue.size === 0 && entry.queue.pending === 0;
    if (isIdle && idleForMs >= USER_QUEUE_IDLE_TTL_MS) {
      perUserQueues.delete(userId);
    }
  }
};

setInterval(cleanupIdleUserQueues, 60_000).unref();

export const runWithAiCoreConcurrency = async <T>(params: {
  userId?: string;
  task: () => Promise<T>;
}): Promise<T> => {
  const env = getEnv();
  globalQueue.concurrency = env.AI_CORE_MAX_CONCURRENCY;

  if (params.userId) {
    const entry = getOrCreateUserQueue(params.userId, env.AI_CORE_MAX_CONCURRENCY_PER_USER);
    entry.lastUsedAt = Date.now();
    return entry.queue.add(async () => {
      try {
        return (await globalQueue.add(params.task)) as T;
      } finally {
        entry.lastUsedAt = Date.now();
      }
    }) as Promise<T>;
  }

  return globalQueue.add(params.task) as Promise<T>;
};
