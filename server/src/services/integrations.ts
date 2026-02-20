import mongoose from "mongoose";

import IntegrationConnectionModel from "../models/integrationConnectionModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import { getConnectorOrThrow, listConnectorCatalog } from "../connectors/registry";
import type { BuiltinConnectorKey, ConnectorKey, ConnectorSyncOptions } from "../connectors/types";
import { enforceFeatureLimit, recordFeatureUsage } from "./entitlements";
import { logger } from "../config/logger";
import type { MutationSource } from "../types/provenance";
import { getEnv } from "../config/env";

const normalizeConnectorKey = (value: string): ConnectorKey => String(value || "").trim().toLowerCase();

const DEFAULT_REQUESTED_UNITS: Record<BuiltinConnectorKey, number> = {
  bank_stub: 10,
  transactions_csv: 0,
  receipts_ocr: 0,
};

const getDefaultRequestedUnits = (connectorKey: ConnectorKey): number => {
  if (Object.prototype.hasOwnProperty.call(DEFAULT_REQUESTED_UNITS, connectorKey)) {
    return DEFAULT_REQUESTED_UNITS[connectorKey as BuiltinConnectorKey] ?? 0;
  }
  return 0;
};

const parseRequestedRecords = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return undefined;
  }
  return Math.max(0, Math.min(1_000_000, Math.floor(n)));
};

const buildMutationSource = (params: { requestId?: string; connectorKey: ConnectorKey; syncRunId: string }): MutationSource => ({
  origin: "connector",
  request_id: params.requestId,
  action_link_id: `integration_sync:${params.syncRunId}`.slice(0, 128),
  actor_type: "system",
  source_ref: `integration:${params.connectorKey}`.slice(0, 128),
  note: "integration_sync",
});

export const listIntegrationsForOrg = async (params: { orgId: mongoose.Types.ObjectId }) => {
  const catalog = listConnectorCatalog();

  const connections = await IntegrationConnectionModel.find({ orgId: params.orgId })
    .select({ connectorKey: 1, status: 1, lastSyncAt: 1, lastError: 1, updatedAt: 1, metadata: 1 })
    .lean();

  const byConnector = new Map(connections.map((connection: any) => [String(connection.connectorKey), connection]));

  return catalog.map((connector) => {
    const state = byConnector.get(connector.connector_key);
    return {
      ...connector,
      status: state ? String((state as any).status) : "disconnected",
      last_sync_at: state?.lastSyncAt || null,
      last_error: state?.lastError || null,
      metadata: state?.metadata || {},
      updated_at: state?.updatedAt || null,
    };
  });
};

export const enqueueIntegrationSync = async (params: {
  orgId: mongoose.Types.ObjectId;
  connectorKey: string;
  triggeredByUserId: mongoose.Types.ObjectId;
  requestId?: string;
  options?: ConnectorSyncOptions;
}) => {
  const env = getEnv();
  const connectorKey = normalizeConnectorKey(params.connectorKey);
  getConnectorOrThrow(connectorKey);

  const requestedRecordsInput = params.options?.records_synced;
  const requestedRecords =
    requestedRecordsInput === undefined
      ? getDefaultRequestedUnits(connectorKey)
      : (parseRequestedRecords(requestedRecordsInput) ?? getDefaultRequestedUnits(connectorKey));

  if (requestedRecords > 0) {
    await enforceFeatureLimit({
      orgId: params.orgId,
      userId: params.triggeredByUserId,
      feature: "connector_sync_records",
      units: requestedRecords,
      requestId: params.requestId,
    });
  }

  const run = await IntegrationSyncRunModel.create({
    orgId: params.orgId,
    connectorKey,
    status: "queued",
    recordsSynced: 0,
    requestId: params.requestId,
    triggeredByUserId: params.triggeredByUserId,
    metadata: {
      requested_records: requestedRecords,
      options: params.options || {},
    },
  }).then((doc) => doc.toObject());

  await IntegrationConnectionModel.findOneAndUpdate(
    { orgId: params.orgId, connectorKey },
    {
      $set: {
        status: "syncing",
        lastError: undefined,
      },
      $setOnInsert: {
        orgId: params.orgId,
        connectorKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);

  const runId = String((run as any)._id);

  if (env.ASYNC_JOBS_ENABLED) {
    const status = String((run as any)?.status || "queued");
    const terminal = status === "succeeded" || status === "failed";
    return { queued: !terminal, run };
  }

  try {
    const processed = await processIntegrationSyncRun(runId);
    return { queued: false, run: processed };
  } catch (error) {
    logger.warn({ error, runId, connectorKey }, "Integration sync failed");
    throw error;
  }
};

export const processIntegrationSyncRun = async (integrationSyncRunId: string) => {
  if (!mongoose.Types.ObjectId.isValid(integrationSyncRunId)) {
    throw new Error("Invalid integrationSyncRunId");
  }

  const run = await IntegrationSyncRunModel.findById(integrationSyncRunId);
  if (!run) {
    throw new Error(`IntegrationSyncRun not found: ${integrationSyncRunId}`);
  }

  if (run.status === "succeeded" || run.status === "failed") {
    return run.toObject();
  }

  const connectorKey = normalizeConnectorKey(String(run.connectorKey || ""));
  const connector = getConnectorOrThrow(connectorKey);

  run.status = "running";
  run.startedAt = run.startedAt || new Date();
  run.error = undefined;
  await run.save();

  const now = new Date();
  const options = (run.metadata as any)?.options || {};
  const requestedRecordsRaw = (run.metadata as any)?.requested_records;
  const requestedRecords = (() => {
    const parsedFromMetadata = parseRequestedRecords(requestedRecordsRaw);
    if (parsedFromMetadata !== undefined) {
      return parsedFromMetadata;
    }

    const parsedFromOptions = parseRequestedRecords((options as any)?.records_synced);
    if (parsedFromOptions !== undefined) {
      return parsedFromOptions;
    }

    return getDefaultRequestedUnits(connectorKey);
  })();

  const userId = run.triggeredByUserId;
  if (!userId) {
    run.status = "failed";
    run.finishedAt = now;
    run.error = "Missing triggeredByUserId";
    await run.save();
    return run.toObject();
  }

  const source = buildMutationSource({ requestId: run.requestId, connectorKey, syncRunId: integrationSyncRunId });

  try {
    const result = await connector.sync(
      {
        orgId: run.orgId as unknown as mongoose.Types.ObjectId,
        userId: userId as unknown as mongoose.Types.ObjectId,
        syncRunId: integrationSyncRunId,
        requestId: run.requestId,
        source,
      },
      {
        ...options,
        records_synced: requestedRecords,
      }
    );

    run.status = "succeeded";
    run.finishedAt = new Date();
    run.recordsSynced = Math.max(0, Math.floor(Number(result?.records_synced || 0)));
    run.error = undefined;
    run.metadata = {
      ...(run.metadata as any),
      result: result?.metadata || {},
    };
    await run.save();

    await IntegrationConnectionModel.findOneAndUpdate(
      { orgId: run.orgId, connectorKey },
      {
        $set: {
          status: "connected",
          lastSyncAt: run.finishedAt,
          lastError: undefined,
          metadata: {
            ...(typeof (result as any)?.metadata === "object" && (result as any).metadata ? (result as any).metadata : {}),
            last_sync_run_id: integrationSyncRunId,
            last_records_synced: run.recordsSynced,
            last_request_id: run.requestId,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null);

    await recordFeatureUsage({
      orgId: run.orgId as unknown as mongoose.Types.ObjectId,
      userId: userId as unknown as mongoose.Types.ObjectId,
      feature: "connector_sync_records",
      units: run.recordsSynced,
      requestId: run.requestId,
      idempotencyKey: `integration_sync:${integrationSyncRunId}`.slice(0, 128),
      context: { connector_key: connectorKey, sync_run_id: integrationSyncRunId },
    }).catch(() => null);

    return run.toObject();
  } catch (error: any) {
    run.status = "failed";
    run.finishedAt = new Date();
    run.recordsSynced = 0;
    run.error = error instanceof Error ? error.message : String(error);
    await run.save();

    await IntegrationConnectionModel.findOneAndUpdate(
      { orgId: run.orgId, connectorKey },
      {
        $set: {
          status: "error",
          lastError: run.error,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null);

    throw error;
  }
};
