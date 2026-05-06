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
 * - Request ID and user ID tracking
 * - Silent mode for test environment
 *
 * @module config/logger
 */

import pino from "pino"; // Fast JSON logger
import pinoHttp from "pino-http"; // HTTP request/response logging middleware

// Flag to check if running in test environment
const isTest = process.env.NODE_ENV === "test";

/**
 * Application Logger Instance
 *
 * Configured with:
 * - Log level: "silent" in test, otherwise from LOG_LEVEL env var (default: "info")
 * - No base properties (cleaner JSON output)
 * - Sensitive data redaction for security
 *
 * REDACTED PATHS:
 * - req.headers.authorization (JWT tokens)
 * - req.headers.cookie (session cookies)
 * - res.headers.set-cookie (set-cookie headers)
 * - req.body.password (user passwords)
 * - req.body.otp (one-time passwords)
 * - req.body.token (authentication tokens)
 * - req.body.command (database commands)
 * - req.body.rows (database rows)
 * - req.body.file (file uploads)
 * - req.body.image (image uploads)
 * - req.body.buffer (binary data)
 * - req.body.receipt_buffer (receipt data)
 */
export const logger = pino({
  level: isTest ? "silent" : process.env.LOG_LEVEL || "info", // Silent in test, configurable otherwise
  base: undefined, // No base properties (pid, hostname) for cleaner output
  redact: {
    paths: [
      "req.headers.authorization", // JWT tokens
      "req.headers.cookie", // Session cookies
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
    ],
    remove: true, // Remove redacted fields entirely
  },
});

/**
 * HTTP Request/Response Logger Middleware
 *
 * This middleware logs HTTP requests and responses using pino-http.
 *
 * FEATURES:
 * - Uses the application logger instance
 * - Adds custom properties (requestId, userId) to each log entry
 * - Custom log level based on HTTP status code:
 *   - 5xx or errors: "error" level
 *   - 4xx: "warn" level
 *   - Everything else: "info" level
 *
 * CUSTOM PROPERTIES:
 * - requestId: Unique request ID for tracing
 * - userId: ID of the authenticated user (if any)
 */
export const httpLogger = pinoHttp({
  logger, // Use the application logger
  customProps: req => ({
    requestId: (req as any).requestId, // Request ID for tracing
    userId: (req as any).user?._id?.toString?.(), // User ID if authenticated
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
 * 4. **Request Context**: Each log entry includes requestId and userId, making
 *    it possible to trace a single request through all log entries.
 *
 * 5. **Silent Mode in Test**: Setting level to "silent" in test environment
 *    prevents log noise during test runs.
 *
 * PATTERNS TO LEARN:
 * ─────────────────
 * - Structured logging with JSON output
 * - Sensitive data redaction patterns
 * - Log level mapping from HTTP status codes
 * - Request-scoped context in logs
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * logger.ts → imported by virtually every file for logging
 * logger.ts → httpLogger middleware in app.ts logs all HTTP requests
 * logger.ts → Pino's performance is critical (it's the fastest Node.js logger)
 * ══════════════════════════════════════════════════════════════════════
 */
