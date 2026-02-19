import IORedis from "ioredis";

import { getEnv } from "./env";
import { logger } from "./logger";

let redis: IORedis | null = null;
let redisUrl = "";

export const getRedis = (): IORedis | null => {
  const env = getEnv();
  const nextUrl = env.REDIS_URL || "";
  if (!nextUrl) {
    return null;
  }

  if (redis && redisUrl === nextUrl) {
    return redis;
  }

  if (redis) {
    redis.disconnect();
  }

  redisUrl = nextUrl;
  redis = new IORedis(nextUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redis.on("error", (error) => {
    if (env.NODE_ENV !== "test") {
      logger.warn({ error }, "Redis connection error");
    }
  });

  return redis;
};

export const closeRedis = async () => {
  if (!redis) {
    return;
  }

  const handle = redis;
  redis = null;
  redisUrl = "";

  handle.disconnect();
};
