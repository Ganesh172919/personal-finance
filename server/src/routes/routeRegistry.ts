/**
 * @fileoverview Route Registry — Single Source of Truth for API Route Mounting
 *
 * This module centralizes ALL API route mounting for the Express application.
 * Every route module is mounted under the /api/* namespace.
 *
 * ROUTE ARCHITECTURE:
 *   The versioned /api/v1/* contract is canonical. Existing /api/* routes
 *   remain mounted as backward-compatible aliases for the web client and
 *   older integrations.
 *
 * FEATURE FLAGS:
 *   - MONETIZATION_ENABLED: gates billing/subscription routes
 *   - TASKS_ENABLED: gates task management routes
 *
 * ROUTE MODULES REGISTERED:
 *   internalToolsRoutes     -> /api/internal/tools
 *   authRoutes              -> /api/auth
 *   configRoutes            -> /api/config
 *   publicShareRoutes       -> /api/public
 *   blogRoutes              -> /api/blogs
 *   growthStoryRoutes       -> /api/growth-stories
 *   v1Routes                -> /api/v1 (canonical REST API aggregator)
 *   monetizationRoutes      -> /api (conditional on MONETIZATION_ENABLED)
 *   aiRoutes                -> /api
 *   chatRoutes              -> /api/chat
 *   financialDataRoutes     -> /api
 *   fileRoutes              -> /api/files
 *   receiptRoutes           -> /api
 *   financialJournalRoutes  -> /api
 *   mediaRoutes             -> /api
 *   taskRoutes              -> /api/tasks (conditional on TASKS_ENABLED)
 *   newsletterRoutes        -> /api/newsletter
 *
 * @module routes/routeRegistry
 */

import type { Application, Router } from "express";

import type { Env } from "../config/env";
import { logger } from "../config/logger";

// ── Route module imports ──────────────────────────────────────────────
import aiRoutes from "./aiRoutes";
import authRoutes from "./authRoutes";
import blogRoutes from "./blogRoutes";
import chatRoutes from "./chatRoutes";
import configRoutes from "./configRoutes";
import financialDataRoutes from "./financialDataRoutes";
import financialJournalRoutes from "./financialJournalRoutes";
import fileRoutes from "./fileRoutes";
import growthStoryRoutes from "./growthStoryRoutes";
import newsletterRoutes from "./newsletterRoutes";
import internalToolsRoutes from "./internalToolsRoutes";
import mediaRoutes from "./mediaRoutes";
import monetizationRoutes from "./monetizationRoutes";
import publicShareRoutes from "./publicShareRoutes";
import receiptRoutes from "./receiptRoutes";
import voiceRoutes from "./voiceRoutes";
import taskRoutes from "./taskRoutes";
import v1Routes from "./v1Routes";
import healthScoreRoutes from "./v1/healthScore";

/**
 * Represents a route module mounted at a specific URL path.
 */
// Type definition representing an Express route module bound to an API endpoint path.
// Holds string URI prefix and associated Express Router instance for dispatching.
// Used across route registration pipeline to maintain deterministic mounting order.
type MountedRoute = {
  /** URL prefix where the router is mounted (e.g., "/api/auth") */
  path: string;
  /** Express Router instance containing the route handlers */
  router: Router;
};

/**
 * Mounts an array of route modules onto the Express application.
 *
 * Each route is mounted in order, so more specific prefixes should come
 * before less specific ones to avoid route shadowing.
 *
 * @param app - Express application instance
 * @param routes - Array of route definitions to mount
 */
// Iterates through ordered route definitions mounting each router onto Express app.
// Emits informational startup log entries confirming successful route attachment.
// Preserves declaration order to prevent broad path prefix shadowing conflicts.
const mountRoutes = (app: Application, routes: MountedRoute[]) => {
  routes.forEach(({ path, router }) => {
    app.use(path, router);
    logger.info(`[Routes] Mounted ${path}`);
  });
};

/**
 * Returns all API route definitions.
 *
 * Routes are ordered from most specific to least specific to prevent
 * Express from matching a broad prefix before a narrow one.
 *
 * @param env - Validated environment configuration
 * @returns Array of route definitions to mount
 */
// Builds complete ordered list of API route bindings based on environment flags.
// Orders specific domain endpoints prior to broad aggregators to ensure matching.
// Conditionally activates task and monetization routes based on configuration.
export const getApiRoutes = (env: Env): MountedRoute[] => {
  const routes: MountedRoute[] = [
    // ── Specific prefixes first (most specific → least specific) ─────
    { path: "/api/v1", router: voiceRoutes },
    { path: "/api", router: voiceRoutes },
    { path: "/api/v1/internal/tools", router: internalToolsRoutes },
    { path: "/api/internal/tools", router: internalToolsRoutes },
    { path: "/api/v1/auth", router: authRoutes },
    { path: "/api/auth", router: authRoutes },
    { path: "/api/v1/config", router: configRoutes },
    { path: "/api/config", router: configRoutes },
    { path: "/api/v1/public", router: publicShareRoutes },
    { path: "/api/public", router: publicShareRoutes },
    { path: "/api/v1/blogs", router: blogRoutes },
    { path: "/api/blogs", router: blogRoutes },
    { path: "/api/v1/growth-stories", router: growthStoryRoutes },
    { path: "/api/growth-stories", router: growthStoryRoutes },
  ];

  if (env.TASKS_ENABLED) {
    routes.push({ path: "/api/v1/tasks", router: taskRoutes });
    routes.push({ path: "/api/tasks", router: taskRoutes });
  }

  // ── Broad aggregator (handles /api/v1/finance/*, /api/v1/orgs/*, etc.) ─
  routes.push({ path: "/api/v1", router: v1Routes });
  routes.push({ path: "/api", router: v1Routes });

  // ── Conditional routes (gated by feature flags) ────────────────────
  if (env.MONETIZATION_ENABLED) {
    routes.push({ path: "/api/v1", router: monetizationRoutes });
    routes.push({ path: "/api", router: monetizationRoutes });
  }

  // ── More specific prefixes after the aggregator ────────────────────
  routes.push(
    { path: "/api/v1", router: aiRoutes },
    { path: "/api", router: aiRoutes },
    { path: "/api/v1/chat", router: chatRoutes },
    { path: "/api/chat", router: chatRoutes },
    { path: "/api/v1", router: financialDataRoutes },
    { path: "/api", router: financialDataRoutes },
    { path: "/api/v1/files", router: fileRoutes },
    { path: "/api/files", router: fileRoutes },
    { path: "/api/v1", router: receiptRoutes },
    { path: "/api", router: receiptRoutes },
    { path: "/api/v1", router: financialJournalRoutes },
    { path: "/api", router: financialJournalRoutes },
    { path: "/api/v1", router: mediaRoutes },
    { path: "/api", router: mediaRoutes },
    { path: "/api/v1/newsletter", router: newsletterRoutes },
    { path: "/api/newsletter", router: newsletterRoutes },
    { path: "/api/v1/finance/health-score", router: healthScoreRoutes },
    { path: "/api/finance/health-score", router: healthScoreRoutes },
  );

  return routes;
};

/**
 * Mounts all API routes onto the Express application.
 *
 * This is the single entry point called by app.ts during server startup.
 * The canonical route set is /api/v1/*, with /api/* aliases retained while
 * existing clients migrate.
 *
 * @param app - Express application instance
 * @param env - Validated environment configuration
 */
// Main entry point mounting canonical v1 routes and backward compatibility aliases.
// Invoked during application bootstrap sequence to attach full API interface.
// Logs registration progress and completion diagnostics across route groups.
export const mountApiRoutes = (app: Application, env: Env) => {
  logger.info("[Routes] Mounting canonical /api/v1 routes with /api compatibility aliases");
  mountRoutes(app, getApiRoutes(env));
  logger.info("[Routes] All API routes mounted successfully");
};

// ── Backward-compatible exports (deprecated — use mountApiRoutes) ─────
/** @deprecated Use mountApiRoutes instead */
// Deprecated alias pointing to unified mountApiRoutes bootstrapping function.
// Maintained for backward compatibility with legacy server bootstrap callers.
// Mounts all canonical API routes and backwards compatible alias endpoints.
export const mountCanonicalApiRoutes = mountApiRoutes;
/** @deprecated Kept for type compatibility — returns empty array */
// Backward-compatible alias referencing primary getApiRoutes route factory.
// Provides signature parity for consumers expecting canonical route list getter.
// Returns complete array of mounted route structures for Express server.
export const getCanonicalApiRoutes = getApiRoutes;
/** @deprecated Legacy routes removed — returns empty array */
// Deprecated helper stub returning an empty list of legacy route definitions.
// Preserved for type compatibility after migration of routes to canonical schema.
// Returns empty array as legacy unversioned routes have been unified.
export const getLegacyApiRoutes = (_env: Env): MountedRoute[] => [];
/** @deprecated Legacy routes removed — no-op */
// Deprecated no-op placeholder for historical legacy route mounting process.
// Maintained to avoid breaking legacy startup scripts importing this symbol.
// Performs no actions since canonical routers now handle all route prefixes.
export const mountLegacyApiRoutes = (_app: Application, _env: Env) => {};
