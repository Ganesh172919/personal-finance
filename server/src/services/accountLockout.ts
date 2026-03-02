/**
 * Account Lockout & Brute-Force Protection
 *
 * Tracks failed login attempts per email/IP and temporarily locks
 * accounts after exceeding the threshold. Uses in-memory storage
 * for simplicity (swap with Redis for multi-instance deployments).
 */

import { logger } from "../config/logger";

export interface LockoutConfig {
  /** Max failed attempts before lockout (default: 5) */
  maxAttempts: number;
  /** Lockout duration in milliseconds (default: 15 minutes) */
  lockoutDurationMs: number;
  /** Window for counting failures in milliseconds (default: 15 minutes) */
  windowMs: number;
}

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

const DEFAULT_CONFIG: LockoutConfig = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
};

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

  /**
   * Clear failed attempts on successful login.
   */
  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Admin: manually unlock an account.
   */
  unlock(key: string): boolean {
    return this.attempts.delete(key);
  }

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

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.attempts.clear();
  }
}

// Singleton instance
export const accountLockout = new AccountLockoutStore();

/**
 * Convenience: build a lockout key from email + IP for maximum protection.
 */
export function lockoutKey(email: string, ip?: string): string {
  const normalized = email.toLowerCase().trim();
  return ip ? `${normalized}:${ip}` : normalized;
}
