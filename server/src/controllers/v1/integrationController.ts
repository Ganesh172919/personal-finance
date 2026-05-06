/**
 * @fileoverview Integration Controller (v1)
 *
 * Manages third-party integrations (connectors) for the organization.
 * Handles connection lifecycle, sync operations, and sync history.
 *
 * Routes served:
 *   GET    /api/v1/integrations                    - listIntegrations
 *   GET    /api/v1/integrations/:id/health         - getIntegrationHealth
 *   POST   /api/v1/integrations/:id/connect        - connectIntegration (admin)
 *   POST   /api/v1/integrations/:id/disconnect     - disconnectIntegration (admin)
 *   POST   /api/v1/integrations/:id/sync           - syncIntegration (admin)
 *   GET    /api/v1/integrations/:id/history         - getIntegrationHistory
 *
 * Key patterns:
 *   - Connector keys validated against a registry (getConnectorOrThrow)
 *   - Connect/disconnect/sync require admin role; health/history are member-readable
 *   - Sync supports simulate_error flag for testing error handling
 *   - Sync runs recorded in IntegrationSyncRunModel for history
 *   - Connection status tracked: connected, disconnected, error
 *
 * @module controllers/v1/integrationController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import IntegrationConnectionModel from "../../models/integrationConnectionModel";
import IntegrationSyncRunModel from "../../models/integrationSyncRunModel";
import { HttpError } from "../../middleware/httpError";
import { enqueueIntegrationSync, listIntegrationsForOrg } from "../../services/integrations";
import { getConnectorOrThrow } from "../../connectors/registry";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

export const listIntegrations = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const connectors = await listIntegrationsForOrg({ orgId });
  return res.json({ org_id: orgId.toString(), connectors, request_id: req.requestId });
};

export const getIntegrationHealth = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const connectorKey = String((req.params as any).id || "").trim().toLowerCase();
  getConnectorOrThrow(connectorKey);

  const connection = await IntegrationConnectionModel.findOne({ orgId, connectorKey })
    .select({ connectorKey: 1, status: 1, lastSyncAt: 1, lastError: 1, metadata: 1, updatedAt: 1 })
    .lean();

  return res.json({
    org_id: orgId.toString(),
    connector_key: connectorKey,
    status: connection ? String((connection as any).status) : "disconnected",
    last_sync_at: connection?.lastSyncAt || null,
    last_error: connection?.lastError || null,
    metadata: connection?.metadata || {},
    updated_at: connection?.updatedAt || null,
    request_id: req.requestId,
  });
};

export const connectIntegration = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const connectorKey = String((req.params as any).id || "").trim().toLowerCase();
  getConnectorOrThrow(connectorKey);

  const now = new Date();
  const updated = await IntegrationConnectionModel.findOneAndUpdate(
    { orgId, connectorKey },
    {
      $set: {
        status: "connected",
        lastError: undefined,
        metadata: {
          ...(req.body && typeof req.body === "object" ? req.body : {}),
          connected_by_user_id: user._id.toString(),
          connected_at: now.toISOString(),
        },
      },
      $setOnInsert: {
        orgId,
        connectorKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .select({ connectorKey: 1, status: 1, lastSyncAt: 1, lastError: 1, metadata: 1, updatedAt: 1 })
    .lean();

  return res.status(200).json({
    org_id: orgId.toString(),
    connector: {
      connector_key: connectorKey,
      status: String((updated as any)?.status || "connected"),
      last_sync_at: (updated as any)?.lastSyncAt || null,
      last_error: (updated as any)?.lastError || null,
      metadata: (updated as any)?.metadata || {},
      updated_at: (updated as any)?.updatedAt || null,
    },
    request_id: req.requestId,
  });
};

export const disconnectIntegration = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const connectorKey = String((req.params as any).id || "").trim().toLowerCase();
  getConnectorOrThrow(connectorKey);

  const updated = await IntegrationConnectionModel.findOneAndUpdate(
    { orgId, connectorKey },
    {
      $set: {
        status: "disconnected",
        lastError: undefined,
        metadata: {},
      },
    },
    { new: true }
  )
    .select({ connectorKey: 1, status: 1, lastSyncAt: 1, lastError: 1, metadata: 1, updatedAt: 1 })
    .lean();

  return res.json({
    org_id: orgId.toString(),
    connector: {
      connector_key: connectorKey,
      status: updated ? String((updated as any).status) : "disconnected",
      last_sync_at: updated?.lastSyncAt || null,
      last_error: updated?.lastError || null,
      metadata: updated?.metadata || {},
      updated_at: updated?.updatedAt || null,
    },
    request_id: req.requestId,
  });
};

export const syncIntegration = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const connectorKey = String((req.params as any).id || "").trim().toLowerCase();
  getConnectorOrThrow(connectorKey);

  const body = req.body as { records_synced?: number; simulate_error?: boolean };
  const simulateError = Boolean(body.simulate_error);

  if (simulateError) {
    const now = new Date();
    const run = await IntegrationSyncRunModel.create({
      orgId,
      connectorKey,
      status: "failed",
      recordsSynced: 0,
      startedAt: now,
      finishedAt: now,
      error: "Simulated connector sync failure",
      requestId: req.requestId,
      triggeredByUserId: user._id,
      metadata: { simulated: true },
    });

    await IntegrationConnectionModel.findOneAndUpdate(
      { orgId, connectorKey },
      {
        $set: {
          status: "error",
          lastSyncAt: now,
          lastError: "Simulated connector sync failure",
          metadata: {
            last_records_synced: 0,
            last_request_id: req.requestId,
            simulated: true,
          },
        },
        $setOnInsert: {
          orgId,
          connectorKey,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(202).json({
      org_id: orgId.toString(),
      queued: false,
      run: {
        id: run._id.toString(),
        connector_key: connectorKey,
        status: run.status,
        records_synced: 0,
        started_at: run.startedAt || null,
        finished_at: run.finishedAt || null,
        error: run.error || null,
      },
      request_id: req.requestId,
    });
  }

  const result = await enqueueIntegrationSync({
    orgId,
    connectorKey,
    triggeredByUserId: user._id,
    requestId: req.requestId,
    options: { records_synced: body.records_synced },
  });

  const run = result.run as any;
  return res.status(202).json({
    org_id: orgId.toString(),
    queued: result.queued,
    run: {
      id: String(run._id),
      connector_key: connectorKey,
      status: String(run.status),
      records_synced: Number(run.recordsSynced || 0),
      started_at: run.startedAt || null,
      finished_at: run.finishedAt || null,
      error: run.error || null,
    },
    request_id: req.requestId,
  });
};

export const getIntegrationHistory = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const connectorKey = String((req.params as any).id || "").trim().toLowerCase();
  getConnectorOrThrow(connectorKey);

  const limitRaw = Number((req.query as any)?.limit || 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 20;

  const runs = await IntegrationSyncRunModel.find({ orgId, connectorKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({ status: 1, recordsSynced: 1, startedAt: 1, finishedAt: 1, error: 1, requestId: 1, createdAt: 1 })
    .lean();

  return res.json({
    org_id: orgId.toString(),
    connector_key: connectorKey,
    history: runs.map((run: any) => ({
      id: String(run._id),
      status: String(run.status),
      records_synced: Number(run.recordsSynced || 0),
      started_at: run.startedAt || null,
      finished_at: run.finishedAt || null,
      error: run.error || null,
      request_id: run.requestId || null,
      created_at: run.createdAt || null,
    })),
    request_id: req.requestId,
  });
};
