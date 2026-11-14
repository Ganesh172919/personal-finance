/**
 * Account Lockout & Brute-Force Protection
 *
 * Tracks failed login attempts per email/IP and temporarily locks
 * accounts after exceeding the threshold. Uses in-memory storage
 * for simplicity (swap with Redis for multi-instance deployments).
 */

import { logger } from "../config/logger";

// Configuration parameters for the account lockout protection service.
// Defines maximum allowed failed attempts, lockout durations, and sliding windows.
// Controls brute-force protection thresholds across authentication endpoints.
export interface LockoutConfig {
  /** Max failed attempts before lockout (default: 5) */
  maxAttempts: number;
  /** Lockout duration in milliseconds (default: 15 minutes) */
  lockoutDurationMs: number;
  /** Window for counting failures in milliseconds (default: 15 minutes) */
  windowMs: number;
}

// Internal representation of failed authentication attempts for a specific key.
// Tracks attempt frequency, initial attempt timestamp, and temporary lockout expiration.
// Used by the lockout store to evaluate rate limits and determine lock states.
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

// Default configuration options applied to the account lockout store instance.
// Establishes a 5-attempt limit and a 15-minute lockout and observation duration.
// Serves as fallback defaults when custom lockout parameters are not provided.
const DEFAULT_CONFIG: LockoutConfig = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
};

// In-memory store and manager for account lockout state and rate limiting.
// Tracks consecutive authentication failures per user or IP address over a time window.
// Automatically locks out suspicious actors and schedules background memory cleanups.
class AccountLockoutStore {
  private attempts = new Map<string, AttemptRecord>();
  private config: LockoutConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<LockoutConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Periodic cleanup of expired records
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

// Evaluates whether a given key is currently under an active authentication lockout.
// Checks lockout expiration and sliding failure window validity against timestamps.
// Returns current lockout status, remaining lock duration, and failure counts.
  /**
   * Check if an account/IP is currently locked out.
   */
  isLocked(key: string): { locked: boolean; remainingMs: number; attempts: number } {
    const record = this.attempts.get(key);
    if (!record) {
      return { locked: false, remainingMs: 0, attempts: 0 };
    }

    // Check if lockout has expired
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      return {
        locked: true,
        remainingMs: record.lockedUntil - Date.now(),
        attempts: record.count,
      };
    }

    // Check if window has expired — reset
    if (Date.now() - record.firstAttempt > this.config.windowMs) {
      this.attempts.delete(key);
      return { locked: false, remainingMs: 0, attempts: 0 };
    }

    return { locked: false, remainingMs: 0, attempts: record.count };
  }

// Records an authentication failure event and determines whether to enforce a lockout.
// Increments failure counters and triggers temporary account lockouts upon threshold breach.
// Returns the resulting lock status, remaining lockout duration, and total attempts.
  /**
   * Record a failed login attempt. Returns whether the account is now locked.
   */
  recordFailure(key: string): { locked: boolean; remainingMs: number; attempts: number } {
    const now = Date.now();
    let record = this.attempts.get(key);

    if (!record || now - record.firstAttempt > this.config.windowMs) {
      record = { count: 0, firstAttempt: now, lockedUntil: null };
    }

    record.count += 1;

    if (record.count >= this.config.maxAttempts) {
      record.lockedUntil = now + this.config.lockoutDurationMs;
      logger.warn(
        "Account locked due to %d failed attempts: key=%s lockoutMinutes=%d",
        record.count,
        key.substring(0, 20) + "...",
        this.config.lockoutDurationMs / 60000,
      );
    }

    this.attempts.set(key, record);

    return {
      locked: record.lockedUntil !== null && now < record.lockedUntil,
      remainingMs: record.lockedUntil ? Math.max(0, record.lockedUntil - now) : 0,
      attempts: record.count,
    };
  }

// Resets failed authentication attempt counters upon a successful user login.
// Clears tracking records from memory to prevent subsequent legitimate attempts from locking.
// Ensures that previously accumulated failures do not penalize successful authentications.
  /**
   * Clear failed attempts on successful login.
   */
  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

// Manually removes an active lockout or tracked failure history for a specific key.
// Allows administrative overrides to restore user access prior to natural expiration.
// Returns a boolean indicating whether a tracked record was located and deleted.
  /**
   * Admin: manually unlock an account.
   */
  unlock(key: string): boolean {
    return this.attempts.delete(key);
  }

// Gathers high-level telemetry on tracked keys and currently enforced lockouts.
// Iterates over active memory records to calculate active lockout counts.
// Returns monitoring statistics suitable for health checks and admin dashboards.
  /**
   * Get current stats for monitoring.
   */
  getStats(): { totalTracked: number; currentlyLocked: number } {
    const now = Date.now();
    let locked = 0;
    for (const record of this.attempts.values()) {
      if (record.lockedUntil && now < record.lockedUntil) locked++;
    }
    return { totalTracked: this.attempts.size, currentlyLocked: locked };
  }

  // Removes expired tracking records and elapsed lockouts from the memory map.
  // Reclaims allocated memory by discarding records whose sliding windows have passed.
  // Runs periodically on an unref'd timer interval to prevent memory growth.
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      // Remove if window expired and not locked
      const windowExpired = now - record.firstAttempt > this.config.windowMs;
      const lockExpired = !record.lockedUntil || now > record.lockedUntil;
      if (windowExpired && lockExpired) {
        this.attempts.delete(key);
      }
    }
  }

  // Shuts down the background cleanup interval and purges all tracking records.
  // Cleans up active system timers to allow graceful node process termination.
  // Resets in-memory failure maps during server shutdown or testing teardowns.
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.attempts.clear();
  }
}

// Default singleton instance of the account lockout store.
// Shared across authentication controllers and middleware for rate limiting.
// Manages global brute-force protection state for the application instance.
// Singleton instance
export const accountLockout = new AccountLockoutStore();

// Generates a composite tracking key combining normalized email and client IP.
// Normalizes email addresses to lower-case and appends IP addresses when available.
// Provides precise targeting for lockout tracking while preventing spoofing.
/**
 * Convenience: build a lockout key from email + IP for maximum protection.
 */
export function lockoutKey(email: string, ip?: string): string {
  const normalized = email.toLowerCase().trim();
  return ip ? `${normalized}:${ip}` : normalized;
}
