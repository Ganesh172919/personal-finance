import { closeDB, connectDB } from "./config/database";
import { getEnv } from "./config/env";
import { closeRedis, getRedis } from "./config/redis";
import { startWorkers } from "./worker/workers";
import { ensureRepeatableJobs } from "./worker/scheduler";
import { logger } from "./config/logger";

let shuttingDown = false;
let workerShutdown: null | (() => Promise<void>) = null;

const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Worker received ${reason}. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Worker graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    if (workerShutdown) {
      await workerShutdown();
    }
    await closeRedis();
    await closeDB();
    logger.info("Worker graceful shutdown completed.");
    process.exit(exitCode);
  } catch (error) {
    logger.error({ error }, "Error during worker graceful shutdown");
    process.exit(1);
  }
};

async function start() {
  const env = getEnv();
  if (!env.WORKER_ENABLED) {
    logger.info("Worker disabled (WORKER_ENABLED=false). Exiting.");
    return;
  }

  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required when WORKER_ENABLED=true");
  }

  getRedis();
  await connectDB();

  const running = await startWorkers();
  workerShutdown = running.shutdown;

  if (env.NODE_ENV !== "test") {
    await ensureRepeatableJobs();
  }

  process.once("SIGINT", () => void shutdown("SIGINT", 0));
  process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
  process.once("uncaughtException", (error) => {
    logger.error({ error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });
  process.once("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });
}

start().catch((error) => {
  logger.error({ error }, "Failed to start worker");
  process.exit(1);
});
