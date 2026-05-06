/**
 * @fileoverview OpenTelemetry Distributed Tracing Configuration
 *
 * This module configures OpenTelemetry for distributed tracing across the FinWise
 * application. OpenTelemetry is an observability framework that provides APIs and
 * tools to collect telemetry data (traces, metrics, logs).
 *
 * WHAT IS DISTRIBUTED TRACING?
 * In a microservice architecture, a single user request may touch multiple services.
 * Distributed tracing creates a "trace" that follows the request across all services,
 * making it possible to debug latency issues and understand request flow.
 *
 * TRACE FLOW IN FINWISE:
 * Client → Express Server → MongoDB (Mongoose)
 *                        → Python AI Service → LLM Provider
 *                        → Redis
 *
 * Each step creates a "span" that is linked together into a single trace.
 *
 * AUTO-INSTRUMENTATION:
 * OpenTelemetry's auto-instrumentation patches Node.js modules at import time:
 * - HTTP module: traces all outgoing/incoming HTTP requests
 * - Mongoose: traces all MongoDB queries with collection name and operation
 *
 * CONFIGURATION:
 * Tracing is only active when OTEL_ENDPOINT is set (e.g., "http://localhost:4318").
 * When not set, all functions are no-ops with zero overhead.
 *
 * @module config/telemetry
 */

// ── Imports ───────────────────────────────────────────────────────────
import { NodeSDK } from "@opentelemetry/sdk-node";                        // OpenTelemetry SDK for Node.js
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"; // Auto-instrumentation
import { getEnv } from "./env";                                           // Environment configuration
import { logger } from "./logger";                                        // Application logger

// Singleton SDK instance (null when tracing is disabled)
let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry distributed tracing.
 *
 * CRITICAL: This must be called BEFORE any other imports that use HTTP or database
 * modules. OpenTelemetry patches these modules at import time to add tracing spans.
 * In server.ts, this is the first function called in start().
 *
 * Only activates when OTEL_ENDPOINT environment variable is set.
 * When not set, this function is a complete no-op (zero overhead).
 *
 * INSTRUMENTATIONS ENABLED:
 * - @opentelemetry/instrumentation-http: Traces HTTP requests (Express routes, axios calls)
 * - @opentelemetry/instrumentation-mongoose: Traces MongoDB queries
 *
 * @example
 * // Set OTEL_ENDPOINT=http://localhost:4318 to enable tracing
 * // Traces will be sent to the OpenTelemetry collector at that endpoint
 */
export const initTelemetry = (): void => {
  const env = getEnv();

  // Skip initialization if OTEL_ENDPOINT is not configured
  if (!env.OTEL_ENDPOINT) {
    logger.info({ event: "otel_skipped" }, "OpenTelemetry disabled (OTEL_ENDPOINT not set)");
    return;
  }

  try {
    // Create the OpenTelemetry SDK with auto-instrumentations
    sdk = new NodeSDK({
      serviceName: "finwise-server", // Identifies this service in trace data
      instrumentations: [
        getNodeAutoInstrumentations({
          // Enable Mongoose instrumentation (traces MongoDB queries)
          "@opentelemetry/instrumentation-mongoose": { enabled: true },
          // Enable HTTP instrumentation (traces Express routes and outgoing requests)
          "@opentelemetry/instrumentation-http": { enabled: true },
        }),
      ],
    });

    // Start the SDK (begins patching modules and collecting traces)
    sdk.start();
    logger.info(
      { event: "otel_started", endpoint: env.OTEL_ENDPOINT },
      "OpenTelemetry tracing initialized",
    );
  } catch (error) {
    // Non-fatal: tracing failure should not prevent the server from starting
    logger.warn(
      { error, event: "otel_init_failed" },
      "OpenTelemetry initialization failed (non-fatal)",
    );
  }
};

/**
 * Gracefully shut down the OpenTelemetry SDK.
 *
 * Called during server shutdown (in server.ts) to flush any pending trace data
 * to the collector before the process exits. This prevents data loss.
 */
export const shutdownTelemetry = async (): Promise<void> => {
  if (sdk) {
    try {
      await sdk.shutdown(); // Flush pending spans to the collector
    } catch {
      // Ignore errors during shutdown (best-effort flush)
    }
    sdk = null; // Clear reference for garbage collection
  }
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Zero-Overhead When Disabled**: When OTEL_ENDPOINT is not set, the SDK
 *    is never created and no modules are patched. There's no performance cost.
 *
 * 2. **Import-Time Patching**: OpenTelemetry instruments Node.js modules by
 *    wrapping their internals. This must happen before the modules are used,
 *    which is why initTelemetry() is called first in server.ts.
 *
 * 3. **Non-Fatal Initialization**: Tracing is an observability feature, not a
 *    core functionality. If it fails, the server should continue running.
 *
 * 4. **Distributed Trace Context**: When the Express server makes a request to
 *    the Python AI service, OpenTelemetry automatically propagates the trace
 *    context via HTTP headers (W3C Trace Context standard).
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * telemetry.ts → initialized first in server.ts
 * telemetry.ts → traces appear in your APM tool (Jaeger, Grafana Tempo, etc.)
 * telemetry.ts → helps debug latency across Express → MongoDB → Python → LLM
 * ══════════════════════════════════════════════════════════════════════
 */
