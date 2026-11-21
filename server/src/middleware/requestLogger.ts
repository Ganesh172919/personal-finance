/**
 * @fileoverview Request Logger Middleware
 *
 * This middleware enriches `req.log` with structured request context and logs
 * request lifecycle events (start, end, slow requests, errors).
 *
 * KEY FEATURES:
 * - Attaches a Pino child logger to `req.log` with full request context
 * - Logs request start at `debug` level (method, path, query params)
 * - Logs request end at `info` level (status code, duration_ms)
 * - Logs at `warn` level when response > 2000ms (slow request)
 * - Logs at `error` level for 5xx responses with error details
 * - Includes orgId, userId, requestId, traceId in every log entry
 *
 * USAGE:
 * This middleware should be placed AFTER requestContext (which sets requestId)
 * and optionalJwtAuth / orgContext (which set user and org context), but BEFORE
 * route handlers so that `req.log` is available in all downstream code.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * RequestLogger Middleware
 * ├── 1. Context Child Logger Attachment
 * │   ├── Pull requestId, traceId, orgId, userId
 * │   └── Bind to req.log via createRequestLogger
 * ├── 2. Start Event Ingestion
 * │   ├── Capture high-resolution clock (process.hrtime.bigint())
 * │   └── Log debug message with method, path, and query params
 * ├── 3. Response Finish Hook (res.on('finish'))
 * │   ├── Calculate Duration: (endTime - startTime) / 1,000,000 (ms)
 * │   ├── Classify Severity:
 * │   │   ├── Status >= 500 -> req.log.error
 * │   │   ├── Duration > 2000ms -> req.log.warn ("Slow request detected")
 * │   │   └── Normal 2xx/3xx/4xx -> req.log.info
 * │   └── Log HTTP status code, method, url, and duration
 * └── 4. Middleware Chaining
 *     └── Invokes next() immediately (non-blocking)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                 Incoming HTTP Express Request                 |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |  req.log = createRequestLogger(req)                           |
 *   |  startTime = process.hrtime.bigint()                          |
 *   |  req.log.debug("Request started")                             |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                         next() Call                           |
 *   |  (Request proceeds to downstream controllers & services)      |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                     res.on("finish") Hook                     |
 *   |  - duration_ms = (process.hrtime.bigint() - startTime) / 1e6  |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                     [Evaluate Status & Duration]
 *                            /      |      \
 *                           /       |       \
 *                          v        v        v
 *                     status>=500  ms>2000  Standard
 *                     req.log.err  req.log. req.log.
 *                                  warn     info
 *                          \        |        /
 *                           \       |       /
 *                            v      v      v
 *   +---------------------------------------------------------------+
 *   | Write structured JSON log line with trace & tenant context    |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module middleware/requestLogger
 */

import type { Request, Response, NextFunction } from "express";
import { createRequestLogger } from "../config/logger";
import { safeHttpPath } from "../observability/httpPath";

/** Threshold in milliseconds for marking a request as slow */
const SLOW_REQUEST_THRESHOLD_MS = 2000;

/**
 * Request Logger Middleware
 *
 * Enriches `req.log` with structured context and logs request lifecycle events.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
// Binds request-scoped child loggers and instruments HTTP response lifecycle completion timing.
// Emits structured logs categorizing standard, degraded slow request, and server failure states.
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Create a child logger with request context and attach it to the request
  req.log = createRequestLogger(req);

  const startTime = process.hrtime.bigint();

  // Completion logging for every request (info/warn/error by status) is done once by
  // pino-http (`httpLogger` in config/logger.ts). This middleware only binds
  // `req.log` and adds the one signal pino-http lacks: a slow-request warning.
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    if (durationMs > SLOW_REQUEST_THRESHOLD_MS && res.statusCode < 500) {
      req.log.warn(
        {
          method: req.method,
          path: safeHttpPath(req.originalUrl || req.url),
          statusCode: res.statusCode,
          duration_ms: Math.round(durationMs * 100) / 100,
          slow: true,
          threshold_ms: SLOW_REQUEST_THRESHOLD_MS,
        },
        "Slow request detected",
      );
    }
  });

  next();
};
