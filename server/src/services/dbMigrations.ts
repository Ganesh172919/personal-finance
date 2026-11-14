/**
 * @fileoverview Idempotent post-connect migrations (run by connectDB/connectDBStrict).
 *
 * 1. memoryRecord text index: MongoDB allows one text index per collection. The
 *    original `{ key: "text", value: "text" }` index is unscoped; it is replaced by
 *    `{ orgId: 1, key: "text", value: "text" }` (name `memory_org_text`). Safe to
 *    run repeatedly and from several replicas at once.
 * 2. Index sync for the models that gained indexes in the scaling work (job claim,
 *    AgentOutput feedback, UsageEvent). `createIndexes()` is a no-op when the
 *    index already exists.
 *
 * Failures are logged, never fatal: the app must still boot if an index build
 * is slow or a concurrent replica won the race.
 */
import mongoose from "mongoose";

import { logger } from "../config/logger";
import MemoryRecordModel, { MEMORY_TEXT_INDEX_NAME } from "../models/memoryRecordModel";

// Checks whether a MongoDB driver error indicates a missing collection namespace.
// Evaluates numeric error codes and matches regular expression message patterns.
// Used to cleanly bypass index queries when a collection has not yet been initialized.
const isNamespaceMissing = (error: any) => error?.code === 26 || /ns does not exist|NamespaceNotFound/i.test(String(error?.message));

/** Drops any text index that is not the orgId-scoped one, then ensures the scoped one exists. */
// Migrates unscoped legacy memory record text indexes to modern tenant-scoped indexes.
// Safely drops obsolete text indexes and establishes the scoped compound text index.
// Handles concurrent replica races gracefully without interrupting server startup.
export const migrateMemoryRecordTextIndex = async (): Promise<{ dropped: string[]; created: boolean }> => {
  const collection = MemoryRecordModel.collection;
  const dropped: string[] = [];

  let indexes: Array<{ name?: string; key?: Record<string, unknown>; weights?: unknown }> = [];
  try {
    indexes = (await collection.indexes()) as typeof indexes;
  } catch (error) {
    if (!isNamespaceMissing(error)) throw error;
  }

  const isText = (index: { key?: Record<string, unknown> }) =>
    Object.values(index.key ?? {}).includes("text") || Object.keys(index.key ?? {}).includes("_fts");

  for (const index of indexes) {
    if (!isText(index) || index.name === MEMORY_TEXT_INDEX_NAME) continue;
    try {
      await collection.dropIndex(String(index.name));
      dropped.push(String(index.name));
    } catch (error: any) {
      // Another replica dropped it first.
      if (error?.codeName !== "IndexNotFound" && error?.code !== 27) throw error;
    }
  }

  const exists = indexes.some(index => index.name === MEMORY_TEXT_INDEX_NAME);
  let created = false;
  if (!exists) {
    try {
      await collection.createIndex(
        { orgId: 1, key: "text", value: "text" },
        { name: MEMORY_TEXT_INDEX_NAME, background: true }
      );
      created = true;
    } catch (error: any) {
      // Concurrent creator / equivalent index already present.
      if (error?.codeName !== "IndexOptionsConflict" && error?.codeName !== "IndexKeySpecsConflict" && error?.code !== 85 && error?.code !== 86) {
        throw error;
      }
    }
  }

  if (dropped.length > 0 || created) {
    logger.info({ event: "memory_text_index_migrated", dropped, created }, "memoryRecord text index migrated to orgId-scoped index");
  }
  return { dropped, created };
};

/** Ensures indexes declared on the schemas of hot models exist (idempotent). */
// Synchronizes high-traffic database indexes declared across critical server models.
// Idempotently triggers index creation for queuing, usage, workflow, and locking models.
// Catches and logs non-fatal index creation errors to preserve continuous app bootup.
export const ensureHotIndexes = async () => {
  const names = ["AgentOutput", "UsageEvent", "UsageLedger", "WorkflowRun", "ExportJob", "IntegrationSyncRun", "DeadLetterJob", "LeaderLock"];
  for (const name of names) {
    const model = mongoose.models[name];
    if (!model) continue;
    try {
      await model.createIndexes();
    } catch (error) {
      logger.warn({ err: (error as Error)?.message, model: name }, "index sync failed (non-fatal)");
    }
  }
};

// Orchestrates all non-blocking database migrations and index builds during server startup.
// Executes memory text index migrations followed by idempotent hot index synchronization.
// Prevents startup failures by isolating and logging background migration exceptions.
export const runStartupMigrations = async () => {
  try {
    await migrateMemoryRecordTextIndex();
  } catch (error) {
    logger.error({ err: (error as Error)?.message }, "memoryRecord text index migration failed (non-fatal)");
  }
  await ensureHotIndexes();
};
