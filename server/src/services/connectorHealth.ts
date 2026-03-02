/**
 * Connector Health Monitor
 *
 * Periodically checks integration connection health and
 * auto-marks stale connections as "error" status.
 * Provides a health summary for the integrations dashboard.
 */

import mongoose from "mongoose";
import IntegrationConnectionModel, {
  type IntegrationConnectionStatus,
} from "../models/integrationConnectionModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import { logger } from "../config/logger";

export interface ConnectorHealthSummary {
  connectorKey: string;
  status: IntegrationConnectionStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
  syncSuccessRate: number; // 0-100
  totalSyncs: number;
  failedSyncs: number;
  avgSyncDurationMs: number | null;
  staleSinceHours: number | null;
}

/**
 * Get health summary for all integration connections in an org.
 */
export async function getConnectorHealthSummary(
  orgId: mongoose.Types.ObjectId,
): Promise<ConnectorHealthSummary[]> {
  const connections = await IntegrationConnectionModel.find({ orgId }).lean();
  const summaries: ConnectorHealthSummary[] = [];

  for (const conn of connections) {
    // Get sync history for success rate calculation
    const syncRuns = await IntegrationSyncRunModel.find({
      orgId: orgId,
      connectorKey: conn.connectorKey,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const totalSyncs = syncRuns.length;
    const failedSyncs = syncRuns.filter((r: any) => r.status === "failed").length;
    const successRate = totalSyncs > 0 ? ((totalSyncs - failedSyncs) / totalSyncs) * 100 : 100;

    const durations = syncRuns
      .filter((r: any) => r.finishedAt && r.startedAt)
      .map((r: any) => new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime());
    const avgDuration = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : null;

    // Calculate staleness
    let staleSinceHours: number | null = null;
    if (conn.lastSyncAt) {
      const hoursSinceSync = (Date.now() - new Date(conn.lastSyncAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 24) {
        staleSinceHours = Math.round(hoursSinceSync);
      }
    }

    summaries.push({
      connectorKey: conn.connectorKey,
      status: conn.status,
      lastSyncAt: conn.lastSyncAt || null,
      lastError: conn.lastError || null,
      syncSuccessRate: Math.round(successRate * 10) / 10,
      totalSyncs,
      failedSyncs,
      avgSyncDurationMs: avgDuration ? Math.round(avgDuration) : null,
      staleSinceHours,
    });
  }

  return summaries;
}

/**
 * Mark connections as "error" if they haven't synced in over 48 hours.
 * Called periodically or via a health-check cron.
 */
export async function markStaleConnections(
  maxStaleHours: number = 48,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxStaleHours * 60 * 60 * 1000);

  const result = await IntegrationConnectionModel.updateMany(
    {
      status: { $in: ["connected", "syncing"] },
      $or: [
        { lastSyncAt: { $lt: cutoff } },
        { lastSyncAt: null, updatedAt: { $lt: cutoff } },
      ],
    },
    {
      $set: {
        status: "error" as IntegrationConnectionStatus,
        lastError: `Connection marked stale — no sync in ${maxStaleHours}+ hours`,
      },
    },
  );

  const marked = result.modifiedCount;
  if (marked > 0) {
    logger.warn("Marked %d stale integration connections as error (threshold: %dh)", marked, maxStaleHours);
  }

  return marked;
}

/**
 * Webhook signature verification for incoming integration webhooks.
 * Supports HMAC-SHA256 signatures.
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  const crypto = require("crypto");
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(computedSignature, "hex");

  if (a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
