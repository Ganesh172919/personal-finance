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
 * PRODUCTION NOTE:
 * In production, this plugin is silent (no warnings). It's a development-time guard.
 * For actual enforcement, use the orgContext middleware which resolves the orgId from
 * the request context.
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

import type { Schema } from "mongoose";
import { logger } from "../config/logger";

/**
 * Mongoose plugin that enforces multi-tenant data isolation.
 *
 * In **development** mode: logs a warning when queries omit the orgId filter.
 * In **production** mode: throws an error to prevent cross-tenant data leaks.
 *
 * @param schema - The Mongoose schema to apply the plugin to
 */
export function orgScopePlugin(schema: Schema): void {
  const isProduction = process.env.NODE_ENV === "production";

  // Query methods that must include orgId in their filter
  const guardedHooks = ["find", "findOne", "countDocuments"] as const;

  // Attach pre-hooks to each guarded query method
  for (const hook of guardedHooks) {
    schema.pre(hook, function (next) {
      const filter = (this as any).getFilter?.() ?? {};

      if (!filter.orgId) {
        const modelName = (this as any).model?.modelName ?? "Unknown";

        if (isProduction) {
          // In production, block queries without orgId to prevent data leaks
          next(new Error(`[orgScopePlugin] ${modelName}.${hook}() blocked: orgId is required in production`));
          return;
        }

        // In development, warn but allow
        logger.warn(
          { event: "org_scope_missing", model: modelName, hook },
          `[orgScopePlugin] Query on ${modelName}.${hook}() without orgId filter!`,
        );
      }

      next();
    });
  }

  // Aggregate pipelines: check first $match stage for orgId
  schema.pre("aggregate", function (next) {
    const pipeline = (this as any).pipeline?.() ?? [];
    const firstMatch = pipeline.find((stage: any) => stage.$match);
    const hasOrgId = firstMatch?.$match?.orgId !== undefined;

    if (!hasOrgId) {
      const modelName = (this as any)._model?.modelName ?? "Unknown";

      if (isProduction) {
        next(new Error(`[orgScopePlugin] ${modelName}.aggregate() blocked: orgId is required in production`));
        return;
      }

      logger.warn(
        { event: "org_scope_missing_aggregate", model: modelName },
        `[orgScopePlugin] Aggregate on ${modelName} without orgId in first $match stage!`,
      );
    }

    next();
  });
}
