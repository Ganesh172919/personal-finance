/**
 * @fileoverview Organization Scope Mongoose Plugin
 *
 * This module provides a Mongoose plugin that enforces multi-tenant data isolation.
 * In a multi-tenant application, every query MUST include an orgId filter to prevent
 * data leakage between organizations.
 *
 * HOW IT WORKS:
 * This plugin attaches pre-hooks to common Mongoose query methods (find, findOne,
 * countDocuments, aggregate). In development mode, it logs a warning if a query
 * doesn't include an orgId filter. This catches cross-org data exposure bugs early.
 *
 * WHY A PLUGIN?
 * Instead of relying on every developer to remember to add orgId filters, this plugin
 * provides a safety net. It's applied to all org-scoped models at schema definition time.
 *
 * ENFORCEMENT:
 * Unscoped queries THROW when `ORG_SCOPE_ENFORCE=true`, or (unset) when NODE_ENV=production;
 * otherwise they log a warning. `ORG_SCOPE_ENFORCE=false` forces warn-only (emergency switch).
 * Deliberate cross-tenant work (migrations, seeds, system rollups) must be wrapped in
 * `withOrgScopeBypass("reason", async () => { ... })`, which is async-context scoped and logged.
 *
 * `orgScopePlugin(schema, { guardWrites: true })` additionally guards updateOne/updateMany/deleteOne/
 * deleteMany/findOneAndUpdate/findOneAndDelete/findOneAndReplace/replaceOne/distinct.
 *
 * @example
 * // Apply to a schema:
 * transactionSchema.plugin(orgScopePlugin);
 *
 * // Now this query will warn in dev (missing orgId):
 * TransactionModel.find({ amount: { $gt: 100 } });
 *
 * // This query is fine:
 * TransactionModel.find({ orgId: "abc123", amount: { $gt: 100 } });
 *
 * @module utils/orgScopePlugin
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { Schema } from "mongoose";
import { logger } from "../config/logger";

const bypassStore = new AsyncLocalStorage<{ reason: string }>();

/**
 * Runs `fn` with org-scope guards disabled for every query started inside it (async-context scoped).
 * Queries execute lazily, so `await`/`.exec()` them INSIDE `fn` (returning a bare Query/Aggregate would
 * execute it after the bypass context has ended).
 */
export function withOrgScopeBypass<T>(reason: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!reason?.trim()) throw new Error("withOrgScopeBypass requires a non-empty reason");
  return bypassStore.run({ reason }, fn);
}

export const isOrgScopeBypassed = (): boolean => bypassStore.getStore() !== undefined;

/** True when unscoped queries must throw instead of warn. */
export const orgScopeEnforced = (): boolean => {
  const flag = String(process.env.ORG_SCOPE_ENFORCE ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return process.env.NODE_ENV === "production";
};

const hasOrgIdKey = (filter: any): boolean => {
  if (!filter || typeof filter !== "object") return false;
  if (filter.orgId !== undefined) return true;
  return Array.isArray(filter.$and) && filter.$and.some((clause: any) => hasOrgIdKey(clause));
};

export interface OrgScopePluginOptions {
  /** Also guard update/delete/distinct operations (opt-in; audited models only). */
  guardWrites?: boolean;
}

const report = (message: string, event: string, meta: Record<string, unknown>): Error | null => {
  if (isOrgScopeBypassed()) return null;
  if (orgScopeEnforced()) return new Error(message);
  logger.warn({ event, ...meta }, message);
  return null;
};

// Enforces multi-tenant organization boundary constraints across Mongoose query methods.
// Throws blocking errors when enforcement is on, or emits warnings otherwise, if queries lack orgId filters.
export function orgScopePlugin(schema: Schema, options: OrgScopePluginOptions = {}): void {
  const readHooks = ["find", "findOne", "countDocuments"] as const;
  const writeHooks = [
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
    "findOneAndUpdate",
    "findOneAndDelete",
    "findOneAndReplace",
    "replaceOne",
    "distinct",
  ] as const;
  const guardedHooks: readonly string[] = options.guardWrites ? [...readHooks, ...writeHooks] : readHooks;

  for (const hook of guardedHooks) {
    schema.pre(hook as any, function (next: (err?: Error) => void) {
      const filter = (this as any).getFilter?.() ?? {};

      if (!hasOrgIdKey(filter)) {
        const modelName = (this as any).model?.modelName ?? "Unknown";
        const error = report(
          orgScopeEnforced()
            ? `[orgScopePlugin] ${modelName}.${hook}() blocked: orgId is required`
            : `[orgScopePlugin] Query on ${modelName}.${hook}() without orgId filter!`,
          "org_scope_missing",
          { model: modelName, hook }
        );
        if (error) {
          next(error);
          return;
        }
      }

      next();
    });
  }

  // Aggregate pipelines: check first $match stage for orgId
  schema.pre("aggregate", function (next) {
    const pipeline = (this as any).pipeline?.() ?? [];
    const firstMatch = pipeline.find((stage: any) => stage.$match);

    if (!hasOrgIdKey(firstMatch?.$match)) {
      const modelName = (this as any)._model?.modelName ?? "Unknown";
      const error = report(
        orgScopeEnforced()
          ? `[orgScopePlugin] ${modelName}.aggregate() blocked: orgId is required`
          : `[orgScopePlugin] Aggregate on ${modelName} without orgId in first $match stage!`,
        "org_scope_missing_aggregate",
        { model: modelName }
      );
      if (error) {
        next(error);
        return;
      }
    }

    next();
  });
}
