import { RedisStore } from "rate-limit-redis";
import type { Store } from "express-rate-limit";

import { getRedis } from "./redis";

export const createRedisRateLimitStore = (prefix: string): Store | undefined => {
  const redis = getRedis();
  if (!redis) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: async (...args: string[]) => {
      if (args.length === 0) {
        throw new Error("rate-limit-redis sendCommand called with no arguments");
      }
      const [command, ...commandArgs] = args;
      return redis.call(command, ...commandArgs) as any;
    },
  });
};
