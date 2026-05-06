/**
 * @fileoverview Server Startup and Lifecycle Management
 *
 * This is the main entry point for the FinWise Express.js server. It orchestrates the
 * complete server lifecycle: initialization, startup, and graceful shutdown.
 *
 * ARCHITECTURE ROLE:
 * - This file is the "composition root" that wires together all infrastructure components
 * - It connects to MongoDB, Redis, configures Passport.js, starts background services,
 *   and creates the Express app via the factory function in app.ts
 * - It handles graceful shutdown to ensure clean resource cleanup on SIGINT/SIGTERM
 *
 * STARTUP SEQUENCE:
 * 1. Initialize OpenTelemetry (must be first for auto-instrumentation)
 * 2. Configure Passport.js authentication strategies
 * 3. Connect to MongoDB
 * 4. Start background services (plugin manager, domain event fanout, workflow scheduler)
 * 5. Create Express app and start listening
 * 6. Set up domain event polling (for non-test environments)
 * 7. Register process signal handlers for graceful shutdown
 *
 * GRACEFUL SHUTDOWN:
 * When a shutdown signal is received (SIGINT, SIGTERM, uncaughtException, unhandledRejection):
 * 1. Stop accepting new connections
 * 2. Clear all polling intervals
 * 3. Stop all background services
 * 4. Close database connections (MongoDB, Redis)
 * 5. Shut down OpenTelemetry
 * 6. Force exit after 15 seconds if shutdown hangs
 *
 * PRODUCTION INSIGHTS:
 * - Uses `.unref()` on timers so they don't prevent Node.js from exiting
 * - The 15-second force exit timeout prevents zombie processes in containerized deployments
 * - The `shuttingDown` flag prevents double-shutdown race conditions
 *
 * @module server
 */

// ── Infrastructure Imports ────────────────────────────────────────────
import { closeDB, connectDB } from "./config/database";        // MongoDB connection lifecycle
import { configurePassport } from "./config/passport";          // JWT + Google OAuth strategies
import { createApp } from "./app";                              // Express app factory (middleware + routes)
import { getEnv } from "./config/env";                          // Validated environment configuration
import { logger } from "./config/logger";                       // Pino JSON logger
import { processPendingDomainEvents } from "./services/domainEventTriggers"; // Domain event polling
import { startPluginManager } from "./modules/plugins/pluginManager";        // Plugin lifecycle manager
import { startDomainEventFanout } from "./modules/realtime/domainEventFanout"; // Realtime event fanout (SSE)
import { startWorkflowScheduler } from "./services/workflowScheduler";        // Background workflow cron
import { closeRedis } from "./config/redis";                    // Redis connection cleanup
import { initTelemetry, shutdownTelemetry } from "./config/telemetry"; // OpenTelemetry tracing

// ── Module-Level State ────────────────────────────────────────────────
// These variables hold references to running services so they can be cleaned up during shutdown.
// Using `null` sentinel pattern allows safe cleanup checks and prevents memory leaks.

// The HTTP server instance (returned by app.listen())
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;
// Guard flag to prevent double-shutdown (e.g., SIGINT followed quickly by SIGTERM)
let shuttingDown = false;
// Interval handle for the domain event polling loop
let domainEventPoller: NodeJS.Timeout | null = null;
// Stop functions for background services (returned by their start() calls)
let pluginManagerStop: (() => void) | null = null;
let domainEventFanoutStop: (() => void) | null = null;
let workflowSchedulerStop: (() => void) | null = null;

/**
 * Performs a graceful shutdown of all server resources.
 *
 * Shutdown sequence:
 * 1. Guard against double-shutdown using the `shuttingDown` flag
 * 2. Set a 15-second force exit timer (prevents zombie processes in containers)
 * 3. Stop accepting new HTTP connections (server.close())
 * 4. Clear the domain event polling interval
 * 5. Stop all background services (plugin manager, event fanout, workflow scheduler)
 * 6. Close database connections (MongoDB, Redis)
 * 7. Shut down OpenTelemetry exporter
 * 8. Exit the process with the appropriate exit code
 *
 * PRODUCTION INSIGHT:
 * The `forceExitTimer.unref()` call ensures the timer doesn't keep the Node.js event loop
 * alive if all other resources are already cleaned up. This is critical for clean container
 * restarts in Kubernetes/Docker environments.
 *
 * @param reason - The signal or event that triggered shutdown (e.g., "SIGINT", "uncaughtException")
 * @param exitCode - Process exit code (0 for clean shutdown, 1 for error)
 */
const shutdown = async (reason: string, exitCode = 0) => {
  // Prevent re-entrant shutdown (e.g., SIGINT followed by SIGTERM)
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info(`Received ${reason}. Starting graceful shutdown...`);

  // Safety net: force exit if graceful shutdown takes too long
  // This prevents zombie processes in containerized environments (Docker, K8s)
  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000); // 15 seconds
  forceExitTimer.unref(); // Don't keep process alive just for this timer

  try {
    // Step 1: Stop accepting new HTTP connections
    // server.close() stops listening but lets existing requests finish
    if (server) {
      await new Promise<void>(resolve => {
        server!.close(() => resolve());
      });
    }

    // Step 2: Clear the domain event polling interval
    if (domainEventPoller) {
      clearInterval(domainEventPoller);
      domainEventPoller = null;
    }

    // Step 3: Stop all background services (in reverse order of startup)
    if (pluginManagerStop) {
      pluginManagerStop();
      pluginManagerStop = null;
    }
    if (domainEventFanoutStop) {
      domainEventFanoutStop();
      domainEventFanoutStop = null;
    }
    if (workflowSchedulerStop) {
      workflowSchedulerStop();
      workflowSchedulerStop = null;
    }

    // Step 4: Close database connections
    await closeDB();    // MongoDB via Mongoose
    await closeRedis(); // Redis via ioredis

    // Step 5: Flush and shut down OpenTelemetry exporters
    await shutdownTelemetry();

    logger.info("Graceful shutdown completed.");
    process.exit(exitCode);
  } catch (error) {
    logger.error({ error }, "Error during graceful shutdown");
    process.exit(1); // Exit with error code if cleanup fails
  }
};

/**
 * Main server startup function.
 *
 * This async function orchestrates the complete server initialization sequence.
 * It's called at the bottom of this file and any startup errors cause the process to exit.
 *
 * STARTUP ORDER MATTERS:
 * 1. Telemetry must initialize first (auto-instrumentation patches HTTP/MongoDB modules)
 * 2. Passport must configure before any auth middleware runs
 * 3. Database must connect before the app starts serving requests
 * 4. Background services start alongside the app
 * 5. Signal handlers are registered last (after everything is running)
 */
async function start() {
  // Load and validate all environment variables
  // getEnv() uses Zod validation and will throw if config is invalid
  const env = getEnv();

  // CRITICAL: Initialize OpenTelemetry BEFORE any other imports
  // OpenTelemetry's auto-instrumentation patches Node.js modules (http, net, etc.)
  // at import time, so it must be the first thing to run
  initTelemetry();

  // Configure Passport.js authentication strategies (JWT from cookies, Google OAuth)
  configurePassport();

  // Connect to MongoDB (falls back to in-memory for dev/test if MONGO_URI is missing)
  await connectDB();

  // Start background services and store their stop functions for graceful shutdown
  pluginManagerStop = startPluginManager().stop;           // Plugin lifecycle management
  domainEventFanoutStop = startDomainEventFanout().stop;   // Realtime SSE event fanout

  // Only start the workflow scheduler if async jobs are not handled by a separate worker process
  // ASYNC_JOBS_ENABLED=true means a dedicated BullMQ worker handles scheduled workflows
  if (env.NODE_ENV !== "test" && !env.ASYNC_JOBS_ENABLED) {
    workflowSchedulerStop = startWorkflowScheduler({ label: "server" }).stop;
  }

  // Create the Express application (all middleware, routes, error handlers)
  const app = createApp();

  // Start listening for HTTP connections
  server = app.listen(env.PORT, () => {
    logger.info(`Server is running on http://localhost:${env.PORT}`);
  });

  // Set server timeouts to prevent slow-loris attacks and hung connections
  // requestTimeout: max time to receive the complete request body
  // headersTimeout: max time to receive request headers (must be > requestTimeout)
  server.requestTimeout = 30_000;  // 30 seconds
  server.headersTimeout = 35_000;  // 35 seconds (slightly more than requestTimeout)

  // Start domain event polling (only in non-test environments)
  // This polls MongoDB for pending domain events and processes them
  // Events trigger side effects like notifications, activity feed updates, etc.
  if (env.NODE_ENV !== "test") {
    const intervalMs = 10_000; // Poll every 10 seconds
    domainEventPoller = setInterval(() => {
      // void keyword: explicitly ignore the promise (fire-and-forget)
      // .catch() prevents unhandled rejection from crashing the process
      void processPendingDomainEvents({ limit: 50 }).catch((error) => {
        logger.warn({ error }, "Domain event poller failed");
      });
    }, intervalMs);
    // .unref() ensures this interval doesn't prevent Node.js from exiting
    domainEventPoller.unref();

    logger.info(
      {
        event: "domain_event_poller_enabled",
        interval_ms: intervalMs,
      },
      "Domain event poller enabled"
    );
  }

  // ── Process Signal Handlers ──────────────────────────────────────────
  // Using `process.once()` ensures each handler fires only once, preventing
  // duplicate shutdown attempts if multiple signals arrive quickly

  // Graceful shutdown on Ctrl+C (development) or container stop (production)
  process.once("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });

  // Graceful shutdown on kill signal (Docker stop, Kubernetes pod termination)
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  // Fatal: uncaught synchronous exception (shouldn't happen in well-written code)
  process.once("uncaughtException", error => {
    logger.error({ error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });

  // Fatal: unhandled promise rejection (missing .catch() on a promise)
  process.once("unhandledRejection", reason => {
    logger.error({ reason }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });
}

// ── Entry Point ───────────────────────────────────────────────────────
// Call start() and handle any startup failures
// If initialization fails (e.g., bad config, DB connection refused), exit immediately
start().catch(error => {
  logger.error({ error }, "Failed to start server");
  process.exit(1); // Exit with error code 1 (general error)
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Composition Root Pattern**: This file is the only place that knows about all
 *    infrastructure components. It wires them together without containing business logic.
 *
 * 2. **Graceful Shutdown**: Production Node.js apps must handle shutdown signals to:
 *    - Stop accepting new requests
 *    - Finish processing in-flight requests
 *    - Close database connections cleanly
 *    - Flush logs and metrics
 *
 * 3. **`.unref()` Pattern**: Timer handles keep the Node.js event loop alive by default.
 *    Calling `.unref()` allows the process to exit naturally when all real work is done.
 *
 * 4. **`void` Operator**: Used with fire-and-forget promises to explicitly document
 *    that we're intentionally not awaiting the result. The `.catch()` prevents crashes.
 *
 * 5. **Process.once()**: Ensures each signal handler fires only once, preventing
 *    cascading shutdown attempts.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * server.ts → imports app.ts (Express factory) → mounts routes → starts listening
 * server.ts → imports config/* (env, DB, Redis, Passport) → initializes infrastructure
 * server.ts → imports services/* → starts background workers
 *
 * LEARNING RESOURCES:
 * ──────────────────
 * - Node.js graceful shutdown: https://nodejs.org/api/process.html#process_signal_events
 * - Express app factory pattern: enables testing with supertest
 * - OpenTelemetry auto-instrumentation: patches modules at import time
 * ══════════════════════════════════════════════════════════════════════
 */
