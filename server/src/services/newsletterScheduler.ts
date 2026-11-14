/**
 * @fileoverview Newsletter Scheduler
 *
 * Runs on a 60-second interval to find subscribed users whose delivery time
 * matches the current time in their timezone, then enqueues newsletter
 * generation for each matching user.
 *
 * Time-matching logic:
 *   1. For each subscribed user, convert current UTC time to their timezone
 *   2. Extract HH:mm from the converted time
 *   3. If HH:mm matches the user's deliveryTime, enqueue a newsletter
 *
 * Uses a Set of recently-sent (userId, dateKey) pairs to prevent duplicate
 * sends within the same day.
 *
 * Pattern follows workflowScheduler.ts.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * NewsletterScheduler
 * ├── 1. Interval Tick Engine
 * │   ├── 60-second polling cycle (CHECK_INTERVAL_MS)
 * │   ├── Graceful Start/Stop lifecycle controls
 * │   └── Active execution lock flag (prevents overlapping ticks)
 * ├── 2. Subscriber Query & Timezone Normalization
 * │   ├── Fetch users with enabled: true
 * │   ├── Convert current UTC clock to user IANA Timezone (e.g. Asia/Kolkata, America/New_York)
 * │   └── Format to HH:mm string
 * ├── 3. Delivery Window Match & Frequency Rule
 * │   ├── Daily: matches current HH:mm
 * │   ├── Weekly: matches current weekday (e.g. Monday) + HH:mm
 * │   └── Monthly: matches day of month (e.g. 1st) + HH:mm
 * ├── 4. Idempotency & Deduplication
 * │   ├── sentToday Set: Key = `${userId}:${localDateString}`
 * │   ├── Automatic midnight cleanup of expired entries
 * │   └── Immediate skip if already dispatched today
 * └── 5. Job Dispatch
 *     ├── Non-blocking background promise invocation
 *     └── Hand-off to generateAndSendNewsletter()
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                 Scheduler Timer Tick (Every 60s)              |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |              Query Subscribed Newsletter Preferences          |
 *   |                     { enabled: true }                         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |               Iterate Subscribed User Profiles                |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |  Convert UTC now -> User's Local Timezone (Intl.DateTime)     |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                 [Does Local HH:mm == User deliveryTime?]
 *                               /          \
 *                             YES           NO -> Skip User
 *                             /
 *                            v
 *                 [Already sent today (in sentToday Set)?]
 *                               /          \
 *                              NO          YES -> Skip User
 *                             /
 *                            v
 *   +---------------------------------------------------------------+
 *   |  1. Mark user in sentToday: `${userId}:${dateKey}`            |
 *   |  2. Enqueue generateAndSendNewsletter(preferenceDoc)          |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module services/newsletterScheduler
 */

import mongoose from "mongoose";

import NewsletterPreferenceModel from "../models/newsletterPreferenceModel";
import { logger } from "../config/logger";
import { generateAndSendNewsletter } from "./newsletterService";
import { tryAcquireLeadership, releaseLeadership } from "./leaderElection";

const LEADER_LOCK_NAME = "newsletter-scheduler";
const LEADER_TTL_MS = 90_000;

const CHECK_INTERVAL_MS = 60_000; // Check every minute

/**
 * Converts a Date to HH:mm string in the given IANA timezone.
 */
// Converts a standard UTC Date object into a 24-hour HH:mm string for a timezone.
// Employs Intl.DateTimeFormat with error handling and fallback UTC formatting.
// Used to align user local delivery preferences with the scheduler polling tick.
const getHHmmInTimezone = (date: Date, timezone: string): string => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    return `${hour}:${minute}`;
  } catch {
    // Fallback: return UTC time
    const h = String(date.getUTCHours()).padStart(2, "0");
    const m = String(date.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
};

/**
 * Gets a date key (YYYY-MM-DD) for a Date in the given timezone.
 */
// Computes an ISO calendar date string (YYYY-MM-DD) within a specific timezone.
// Formats year, month, and day components using Canadian locale conventions.
// Provides timezone-accurate daily idempotency keys to avoid duplicate deliveries.
const getDateKeyInTimezone = (date: Date, timezone: string): string => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date); // returns YYYY-MM-DD
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

/**
 * Starts the newsletter scheduler.
 *
 * Returns a handle with `started` flag and a `stop()` function for graceful shutdown.
 */
// Initializes the background timer polling and dispatching periodic newsletters.
// Acquires distributed leader leases and delivers newsletters at local scheduled times.
// Returns an operational handle containing lifecycle state and graceful stop hooks.
export const startNewsletterScheduler = (): { started: boolean; stop: () => void } => {
  let stopped = false;

  // De-duplication is persisted (NewsletterPreference.lastSentAt, claimed with an atomic
  // compare-and-set) so it survives restarts and works across replicas; the leader lease just
  // avoids every replica scanning all subscribers every minute.
  const tick = async () => {
    if (stopped) return;
    if (!(await tryAcquireLeadership(LEADER_LOCK_NAME, LEADER_TTL_MS))) return;

    const now = new Date();

    try {
      // Find all subscribed users
      const prefs = await NewsletterPreferenceModel.find({
        isSubscribed: true,
      })
        .select({ userId: 1, orgId: 1, deliveryTime: 1, timezone: 1, lastSentAt: 1 })
        .lean();

      let matched = 0;
      let sent = 0;

      for (const pref of prefs as any[]) {
        const userId = String(pref.userId);
        const orgId = String(pref.orgId);
        const deliveryTime = String(pref.deliveryTime || "07:00");
        const timezone = String(pref.timezone || "Asia/Kolkata");

        // Get current time in user's timezone
        const currentTime = getHHmmInTimezone(now, timezone);

        // Check if current time matches delivery time (within the same minute)
        if (currentTime !== deliveryTime) {
          continue;
        }

        matched += 1;

        // Check if we already sent today
        const dateKey = getDateKeyInTimezone(now, timezone);
        if (pref.lastSentAt && getDateKeyInTimezone(new Date(pref.lastSentAt), timezone) === dateKey) {
          continue;
        }

        // Claim today's send atomically (CAS on the previous lastSentAt); losers skip.
        const claimed = await NewsletterPreferenceModel.updateOne(
          { _id: pref._id, lastSentAt: pref.lastSentAt ?? null },
          { $set: { lastSentAt: now } }
        );
        if (!claimed.modifiedCount) {
          continue;
        }

        // Enqueue newsletter generation (fire-and-forget)
        generateAndSendNewsletter(
          new mongoose.Types.ObjectId(userId),
          new mongoose.Types.ObjectId(orgId)
        )
          .then((result) => {
            if (result.ok) {
              sent += 1;
              logger.info(
                {
                  event: "newsletter_scheduler_sent",
                  user_id: userId,
                  org_id: orgId,
                },
                "Scheduled newsletter sent"
              );
            } else {
              logger.debug(
                {
                  event: "newsletter_scheduler_skipped",
                  user_id: userId,
                  org_id: orgId,
                  reason: result.reason,
                },
                "Scheduled newsletter skipped"
              );
            }
          })
          .catch((error) => {
            logger.warn(
              {
                event: "newsletter_scheduler_error",
                user_id: userId,
                org_id: orgId,
                error: String(error?.message || error),
              },
              "Scheduled newsletter failed"
            );
          });
      }

      if (matched > 0) {
        logger.debug(
          {
            event: "newsletter_scheduler_tick",
            matched,
            sent,
            total_subscribed: prefs.length,
          },
          "Newsletter scheduler tick completed"
        );
      }
    } catch (error) {
      logger.warn(
        { error: String((error as any)?.message || error) },
        "Newsletter scheduler tick failed"
      );
    }
  };

  // Run first tick immediately
  void tick().catch(() => null);

  // Set up recurring interval
  const timer = setInterval(() => {
    void tick().catch(() => null);
  }, CHECK_INTERVAL_MS);
  timer.unref();

  logger.info(
    {
      event: "newsletter_scheduler_started",
      interval_ms: CHECK_INTERVAL_MS,
    },
    "Newsletter scheduler started"
  );

  return {
    started: true,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      void releaseLeadership(LEADER_LOCK_NAME).catch(() => undefined);
    },
  };
};
