import type { Schema } from "mongoose";
import { logger } from "../config/logger";

/**
 * Mongoose plugin: org-scoped data isolation guard.
 *
 * Apply to any model that should ALWAYS be queried with an orgId filter.
 * In development mode, logs a warning when a query omits the orgId filter.
 * This catches accidental cross-org data exposure bugs early.
 *
 * Usage:
 *   transactionSchema.plugin(orgScopePlugin);
 */
export function orgScopePlugin(schema: Schema): void {
  const guardedHooks = [
    "find",
    "findOne",
    "countDocuments",
  ] as const;

  for (const hook of guardedHooks) {
    schema.pre(hook, function (next) {
      const filter = (this as any).getFilter?.() ?? {};

      if (!filter.orgId && process.env.NODE_ENV === "development") {
        const modelName = (this as any).model?.modelName ?? "Unknown";
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

    if (!hasOrgId && process.env.NODE_ENV === "development") {
      const modelName = (this as any)._model?.modelName ?? "Unknown";
      logger.warn(
        { event: "org_scope_missing_aggregate", model: modelName },
        `[orgScopePlugin] Aggregate on ${modelName} without orgId in first $match stage!`,
      );
    }

    next();
  });
}
