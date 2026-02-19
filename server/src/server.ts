import { closeDB, connectDB } from "./config/database";
import { configurePassport } from "./config/passport";
import { createApp } from "./app";
import { getEnv } from "./config/env";
import { logger } from "./config/logger";
import { processPendingDomainEvents } from "./services/domainEventTriggers";

let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;
let shuttingDown = false;
let domainEventPoller: NodeJS.Timeout | null = null;

const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info(`Received ${reason}. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise<void>(resolve => {
        server!.close(() => resolve());
      });
    }
    if (domainEventPoller) {
      clearInterval(domainEventPoller);
      domainEventPoller = null;
    }
    await closeDB();
    logger.info("Graceful shutdown completed.");
    process.exit(exitCode);
  } catch (error) {
    logger.error({ error }, "Error during graceful shutdown");
    process.exit(1);
  }
};

async function start() {
  const env = getEnv();
  configurePassport();
  await connectDB();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`Server is running on http://localhost:${env.PORT}`);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;

  if (env.NODE_ENV !== "test" && (!env.REDIS_URL || !env.WORKER_ENABLED)) {
    const intervalMs = 10_000;
    domainEventPoller = setInterval(() => {
      void processPendingDomainEvents({ limit: 50 }).catch((error) => {
        logger.warn({ error }, "Domain event poller failed");
      });
    }, intervalMs);
    domainEventPoller.unref();

    logger.info(
      {
        event: "domain_event_poller_enabled",
        interval_ms: intervalMs,
      },
      "Domain event poller enabled (Redis/worker unavailable)"
    );
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  process.once("uncaughtException", error => {
    logger.error({ error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });

  process.once("unhandledRejection", reason => {
    logger.error({ reason }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });
}

start().catch(error => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});
