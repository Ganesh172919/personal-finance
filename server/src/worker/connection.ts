import type { ConnectionOptions } from "bullmq";

import { getEnv } from "../config/env";

const parseRedisUrl = (raw: string) => {
  const url = new URL(raw);
  const port = url.port ? Number(url.port) : url.protocol === "redis:" || url.protocol === "rediss:" ? 6379 : 6379;
  const db = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isFinite(db as number) ? (db as number) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
};

export const getBullMqConnection = (): ConnectionOptions => {
  const env = getEnv();
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required to use BullMQ.");
  }

  return parseRedisUrl(env.REDIS_URL);
};

