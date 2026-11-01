/**
 * @fileoverview Service Logger Utility
 *
 * Provides a factory function and helper utilities for structured logging
 * within service modules. This eliminates logging boilerplate and ensures
 * consistent log format across all services.
 *
 * KEY FEATURES:
 * - `createServiceLogger(serviceName)` — returns a Pino child logger bound to a service
 * - `logEntry(serviceLogger, operation, context)` — logs operation start at debug level
 * - `logExit(serviceLogger, operation, context, durationMs)` — logs operation end at debug level
 * - `logSlowOperation(serviceLogger, operation, durationMs, threshold)` — warns if over threshold
 *
 * USAGE:
 * ```ts
 * import { createServiceLogger, logEntry, logExit, logSlowOperation } from "../utils/serviceLogger";
 *
 * const svcLog = createServiceLogger("transactionService");
 *
 * export const doSomething = async (params: { orgId: string }) => {
 *   const start = Date.now();
 *   logEntry(svcLog, "doSomething", { orgId: params.orgId });
 *   // ... business logic ...
 *   const durationMs = Date.now() - start;
 *   logExit(svcLog, "doSomething", { orgId: params.orgId }, durationMs);
 *   logSlowOperation(svcLog, "doSomething", durationMs, 500);
 *   return result;
 * };
 * ```
 *
 * @module utils/serviceLogger
 */

import type { Logger } from "pino";
import { logger } from "../config/logger";

/**
 * Creates a child logger scoped to a specific service.
 *
 * The returned logger automatically includes a `service` field in every
 * log entry, making it easy to filter logs by service in aggregation tools.
 *
 * @param {string} serviceName - Name of the service (e.g., "aiCoreClient", "transactionService")
 * @returns {Logger} Pino child logger with service binding
 */
export const createServiceLogger = (serviceName: string): Logger =>
  logger.child({ service: serviceName });

/**
 * Logs the entry (start) of a service operation at debug level.
 *
 * @param {Logger} serviceLogger - The service-scoped Pino logger
 * @param {string} operation - Name of the operation (e.g., "fetchTransactionsForAi")
 * @param {Record<string, unknown>} [context] - Additional context fields (e.g., orgId, userId)
 */
export const logEntry = (
  serviceLogger: Logger,
  operation: string,
  context?: Record<string, unknown>,
): void => {
  serviceLogger.debug({ operation, ...context }, `${operation} started`);
};

/**
 * Logs the exit (completion) of a service operation at debug level.
 *
 * @param {Logger} serviceLogger - The service-scoped Pino logger
 * @param {string} operation - Name of the operation
 * @param {Record<string, unknown>} [context] - Additional context fields
 * @param {number} [durationMs] - Duration of the operation in milliseconds
 */
export const logExit = (
  serviceLogger: Logger,
  operation: string,
  context?: Record<string, unknown>,
  durationMs?: number,
): void => {
  serviceLogger.debug(
    {
      operation,
      duration_ms: durationMs !== undefined ? Math.round(durationMs * 100) / 100 : undefined,
      ...context,
    },
    `${operation} completed`,
  );
};

/**
 * Logs a warning if an operation exceeded a duration threshold.
 *
 * This is useful for identifying slow operations that may need optimization.
 * The threshold is configurable per call so different operations can have
 * different acceptable durations.
 *
 * @param {Logger} serviceLogger - The service-scoped Pino logger
 * @param {string} operation - Name of the operation
 * @param {number} durationMs - Actual duration in milliseconds
 * @param {number} threshold - Threshold in milliseconds; warn if durationMs > threshold
 */
export const logSlowOperation = (
  serviceLogger: Logger,
  operation: string,
  durationMs: number,
  threshold: number,
): void => {
  if (durationMs > threshold) {
    serviceLogger.warn(
      {
        operation,
        duration_ms: Math.round(durationMs * 100) / 100,
        threshold_ms: threshold,
        overage_ms: Math.round((durationMs - threshold) * 100) / 100,
      },
      `Slow operation: ${operation} took ${Math.round(durationMs)}ms (threshold: ${threshold}ms)`,
    );
  }
};
