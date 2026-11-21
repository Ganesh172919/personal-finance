/**
 * @fileoverview Logger Configuration Module
 *
 * This module configures the application logging system using Pino, a fast JSON logger.
 * It provides both application-level logging and HTTP request/response logging.
 *
 * KEY FEATURES:
 * - High-performance JSON logging with Pino
 * - Automatic request/response logging with pino-http
 * - Sensitive data redaction (passwords, tokens, cookies, etc.)
 * - Custom log levels based on HTTP status codes
 * - Request ID, trace ID, user ID, and org ID tracking
 * - Environment-aware pretty-printing (pino-pretty in development, JSON in production)
 * - Request-scoped child loggers via createRequestLogger()
 * - Silent mode for test environment
 *
 * @module config/logger
 */

import { randomUUID } from "crypto"; // Node.js crypto module for UUID generation
import { createRequire } from "node:module";
import pino from "pino"; // Fast JSON logger
import pinoHttp from "pino-http"; // HTTP request/response logging middleware
import type { Request } from "express"; // Express types
import { safeHttpPath } from "../observability/httpPath";

// Flag to check if running in test environment
const isTest = process.env.NODE_ENV === "test";
const isDev = process.env.NODE_ENV === "development";

// Defines object key paths containing sensitive customer and security credentials.
// Prevents authorization headers, passwords, and tokens from appearing in log streams.
const REDACT_PATHS = [
  "req.headers.authorization", // JWT tokens
  "req.headers.cookie", // Session cookies
  'req.headers["x-csrf-token"]',
  'req.headers["x-api-key"]',
  'req.headers["x-api-key-id"]',
  "res.headers.set-cookie", // Set-cookie headers
  "req.body.password", // User passwords
  "req.body.otp", // One-time passwords
  "req.body.token", // Authentication tokens
  "req.body.command", // Database commands
  "req.body.rows", // Database rows
  "req.body.file", // File uploads
  "req.body.image", // Image uploads
  "req.body.buffer", // Binary data
  "req.body.receipt_buffer", // Receipt data
  "req.body.audioBase64",
  "req.body.transcript",
  "req.body.query",
  "req.body.content",
  "req.body.text",
];

// Configures development-mode log formatting using pino-pretty for human readability.
// Gracefully falls back to raw JSON stream output if formatting dependencies are omitted.
const buildTransport = (): pino.TransportSingleOptions | undefined => {
  if (!isDev) return undefined;
  let target: string;
  try {
    target = createRequire(import.meta.url).resolve("pino-pretty");
  } catch {
    // JSON logging remains available in minimal installs without the dev formatter.
    return undefined;
  }
  return {
    target,
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
};

// Primary application-wide structured JSON logger configured with Pino.
// Enforces security redaction rules and environment-specific output verbosity levels.
export const logger = pino({
  level: isTest ? "silent" : process.env.LOG_LEVEL || "info", // Silent in test, configurable otherwise
  base: undefined, // No base properties (pid, hostname) for cleaner output
  redact: {
    paths: REDACT_PATHS,
    remove: true, // Remove redacted fields entirely
  },
  transport: buildTransport(),
});

// Instantiates a request-scoped child logger enriched with unique trace and user identities.
// Binds request IDs, trace headers, organization scopes, and user contexts to all subsequent log events.
export const createRequestLogger = (req: Request): pino.Logger => {
  const traceId = req.header("x-trace-id") || req.traceId || randomUUID();

  // Store traceId on the request for downstream middleware/routes
  req.traceId = traceId;

  return logger.child({
    requestId: req.requestId,
    traceId,
    orgId: req.org?.orgId,
    userId: (req as any).user?._id?.toString?.(),
  });
};

// Express middleware tracking incoming HTTP transactions and associated execution outcomes.
// Automatically derives log severity levels from response status codes and records request context.
export const httpLogger = pinoHttp({
  logger, // Use the application logger
  serializers: {
    req: req => ({ id: req.id, method: req.method, url: safeHttpPath(req.url || "/") }),
  },
  genReqId: req => (req as any).requestId, // Reuse the existing requestId
  customProps: req => ({
    requestId: (req as any).requestId, // Request ID for tracing
    traceId: (req as any).traceId || req.headers["x-trace-id"] || randomUUID(), // Distributed trace ID
    userId: (req as any).user?._id?.toString?.(), // User ID if authenticated
    orgId: (req as any).org?.orgId, // Organization ID if available
  }),
  customLogLevel: (_req, res, err) => {
    // Error level for 5xx errors or exceptions
    if (err || res.statusCode >= 500) return "error";
    // Warn level for 4xx errors
    if (res.statusCode >= 400) return "warn";
    // Info level for everything else
    return "info";
  },
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Structured Logging**: Pino outputs JSON-formatted logs, which are essential
 *    for log aggregation tools (ELK Stack, Datadog, CloudWatch). JSON logs can
 *    be parsed, filtered, and analyzed programmatically.
 *
 * 2. **Sensitive Data Redaction**: The `redact` option automatically removes
 *    sensitive fields (passwords, tokens, cookies) from log output. This is
 *    a critical security practice to prevent credential leakage in logs.
 *
 * 3. **Log Levels by Status Code**: HTTP logs are automatically categorized:
 *    - 5xx → error (server errors, needs investigation)
 *    - 4xx → warn (client errors, may indicate abuse)
 *    - 2xx/3xx → info (normal operation)
 *
 * 4. **Request Context**: Each log entry includes requestId, traceId, userId,
 *    and orgId, making it possible to trace a single request through all log entries.
 *
 * 5. **Silent Mode in Test**: Setting level to "silent" in test environment
 *    prevents log noise during test runs.
 *
 * 6. **Environment-Aware Transport**: Development uses pino-pretty for readability;
 *    production uses raw JSON for log aggregation pipelines.
 *
 * PATTERNS TO LEARN:
 * ─────────────────
 * - Structured logging with JSON output
 * - Sensitive data redaction patterns
 * - Log level mapping from HTTP status codes
 * - Request-scoped child loggers for contextual logging
 * - Dynamic transport loading for environment-specific formatting
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * logger.ts → imported by virtually every file for logging
 * logger.ts → httpLogger middleware in app.ts logs all HTTP requests
 * logger.ts → createRequestLogger() used by requestLogger middleware
 * logger.ts → Pino's performance is critical (it's the fastest Node.js logger)
 * ══════════════════════════════════════════════════════════════════════
 */
