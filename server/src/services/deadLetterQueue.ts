/**
 * @fileoverview Dead-Letter Queue for Fire-and-Forget Operations
 *
 * Many places in the codebase use `void somePromise.catch(() => null)` to
 * fire-and-forget operations like updating `lastUsedAt` timestamps or
 * recording usage events. These silently swallow errors, making failures
 * invisible.
 *
 * ============================================================================
 * MINDMAP FLOW: DEAD-LETTER QUEUE & SILENT FAILURE OBSERVABILITY
 * ============================================================================
 * - Dead-Letter Queue (DLQ) Architecture
 *     ├── 1. Fire-and-Forget Interception
 *     │   ├── Wraps unawaited background Promises
 *     │   ├── Binds operation tag and structured contextual metadata
 *     │   └── Eliminates silent `.catch(() => null)` code smells
 *     ├── 2. In-Memory Ring Buffer Storage
 *     │   ├── Bounded Capacity: MAX_DEAD_LETTERS (500 entries)
 *     │   ├── FIFO Eviction: Oldest failures evicted on overflow to protect memory
 *     │   └── Thread-Safe / Event-Loop Safe Operations
 *     ├── 3. Structured Logging & Incident Visibility
 *     │   ├── Pino Warning Logs emitted with operation name and context
 *     │   └── Failure stack traces preserved for diagnostic inspection
 *     └── 4. Diagnostic & Health Endpoints
 *         ├── getDeadLetters(): Snapshot of recent failures
 *         ├── getDeadLetterStats(): Aggregated count breakdown by operation
 *         └── clearDeadLetters(): Clean state reset for integration tests
 *
 * ============================================================================
 * ASCII FLOW: FIRE-AND-FORGET LIFECYCLE & RETENTION PIPELINE
 * ============================================================================
 *               [ Background Task Initiated (e.g., Update Timestamp) ]
 *                                       |
 *                                       v
 *                     +-----------------------------------+
 *                     |   fireAndForget(promise, op, ctx) |
 *                     +-----------------+-----------------+
 *                                       |
 *                                       v
 *                           Did Promise Resolve or Reject?
 *                                  /              \
 *                        Resolve  /                \ Reject (Error)
 *                                v                  v
 *                       [ Silent Success ]   +--------------------------+
 *                                            | Extract errorMessage     |
 *                                            | Create DeadLetter Record |
 *                                            +------------+-------------+
 *                                                         |
 *                                                         v
 *                                            Buffer length >= 500?
 *                                                   /       \
 *                                              Yes /         \ No
 *                                                 v           v
 *                                          +-------------+  +---------------+
 *                                          | shift()     |  | Push entry to |
 *                                          | oldest item |  | deadLetters   |
 *                                          +------+------+  +-------+-------+
 *                                                 |                 |
 *                                                 +-------->--------+
 *                                                                   |
 *                                                                   v
 *                                                    +------------------------------+
 *                                                    | logger.warn(entry) emitted   |
 *                                                    | Visible in DLQ Health Route  |
 *                                                    +------------------------------+
 *
 * This module provides a lightweight in-memory dead-letter queue that:
 * 1. Captures failed fire-and-forget operations with context
 * 2. Exposes them via a diagnostic endpoint for debugging
 * 3. Automatically evicts old entries to prevent memory leaks
 *
 * @module services/deadLetterQueue
 */

import { logger } from "../config/logger";

interface DeadLetter {
  /** Human-readable description of the failed operation */
  operation: string;
  /** The error that caused the failure */
  error: string;
  /** ISO timestamp of when the failure occurred */
  timestamp: string;
  /** Optional additional context (e.g., user ID, entity ID) */
  context?: Record<string, unknown>;
}

/** Maximum number of dead letters to retain (FIFO eviction) */
const MAX_DEAD_LETTERS = 500;

/** In-memory ring buffer of dead letters */
const deadLetters: DeadLetter[] = [];

/** Record a failure already handled by a caller, using the same bounded queue. */
export function recordDeadLetter(params: {
  operation: string;
  error: unknown;
  context?: string | Record<string, unknown>;
  payload?: Record<string, unknown>;
}): void {
  const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
  const context = typeof params.context === "string"
    ? { ...params.payload, source: params.context }
    : { ...params.payload, ...params.context };
  if (deadLetters.length >= MAX_DEAD_LETTERS) deadLetters.shift();
  deadLetters.push({ operation: params.operation, error: errorMessage, timestamp: new Date().toISOString(), context });
  logger.warn({ operation: params.operation, error: errorMessage, context }, "Background operation failed");
}

/**
 * Fire-and-forget wrapper that captures errors to the dead-letter queue
 * instead of silently swallowing them.
 *
 * @example
 * ```ts
 * // Before (silent failure):
 * void UserModel.updateOne({ _id: userId }, { lastLoginAt: new Date() }).catch(() => null);
 *
 * // After (captured failure):
 * fireAndForget(
 *   UserModel.updateOne({ _id: userId }, { lastLoginAt: new Date() }),
 *   "update lastLoginAt",
 *   { userId }
 * );
 * ```
 *
 * @param promise - The promise to wrap
 * @param operation - Human-readable description of the operation
 * @param context - Optional additional context for debugging
 */
export function fireAndForget(
  promise: Promise<unknown>,
  operation: string,
  context?: Record<string, unknown>,
): void {
  promise.catch((err: unknown) => {
    recordDeadLetter({ operation, error: err, context });
  });
}

/**
 * Get all dead letters (for diagnostic endpoint).
 * Returns a copy to prevent external mutation.
 */
export function getDeadLetters(): DeadLetter[] {
  return [...deadLetters];
}

/**
 * Get dead letter count by operation name.
 * Useful for monitoring dashboards.
 */
export function getDeadLetterStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const entry of deadLetters) {
    stats[entry.operation] = (stats[entry.operation] || 0) + 1;
  }
  return stats;
}

/**
 * Clear all dead letters (for testing or manual cleanup).
 */
export function clearDeadLetters(): void {
  deadLetters.length = 0;
}
