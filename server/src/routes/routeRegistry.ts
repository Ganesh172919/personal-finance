/**
 * @fileoverview Route Registry — Single Source of Truth for API Route Mounting
 *
 * This module centralizes ALL API route mounting for the Express application.
 * Every route module is mounted under the /api/* namespace.
 *
 * ROUTE ARCHITECTURE:
 *   All routes live under /api/* — there is no /api/v1 split.
 *   This keeps the API surface simple and avoids versioning overhead
 *   during early-stage development. When versioning is needed later,
 *   new versions can be introduced without breaking existing clients.
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
 *   v1Routes                -> /api (main REST API aggregator)
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
import taskRoutes from "./taskRoutes";
import v1Routes from "./v1Routes";
import healthScoreRoutes from "./v1/healthScore";

/**
 * Represents a route module mounted at a specific URL path.
 */
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
export const getApiRoutes = (env: Env): MountedRoute[] => {
  const routes: MountedRoute[] = [
    // ── Specific prefixes first (most specific → least specific) ─────
    { path: "/api/internal/tools", router: internalToolsRoutes },
    { path: "/api/auth", router: authRoutes },
    { path: "/api/config", router: configRoutes },
    { path: "/api/public", router: publicShareRoutes },
    { path: "/api/blogs", router: blogRoutes },
    { path: "/api/growth-stories", router: growthStoryRoutes },
  ];

  if (env.TASKS_ENABLED) {
    routes.push({ path: "/api/tasks", router: taskRoutes });
  }

  // ── Broad aggregator (handles /api/finance/*, /api/orgs/*, etc.) ─
  routes.push({ path: "/api", router: v1Routes });

  // ── Conditional routes (gated by feature flags) ────────────────────
  if (env.MONETIZATION_ENABLED) {
    routes.push({ path: "/api", router: monetizationRoutes });
  }

  // ── More specific prefixes after the aggregator ────────────────────
  routes.push(
    { path: "/api", router: aiRoutes },
    { path: "/api/chat", router: chatRoutes },
    { path: "/api", router: financialDataRoutes },
    { path: "/api/files", router: fileRoutes },
    { path: "/api", router: receiptRoutes },
    { path: "/api", router: financialJournalRoutes },
    { path: "/api", router: mediaRoutes },
    { path: "/api/newsletter", router: newsletterRoutes },
    { path: "/api/finance/health-score", router: healthScoreRoutes },
  );

  return routes;
};

/**
 * Mounts all API routes onto the Express application.
 *
 * This is the single entry point called by app.ts during server startup.
 * All routes are mounted under /api/* — there are no legacy or versioned
 * route sets.
 *
 * @param app - Express application instance
 * @param env - Validated environment configuration
 */
export const mountApiRoutes = (app: Application, env: Env) => {
  logger.info("[Routes] Mounting API routes under /api/*");
  mountRoutes(app, getApiRoutes(env));
  logger.info("[Routes] All API routes mounted successfully");
};

// ── Backward-compatible exports (deprecated — use mountApiRoutes) ─────
/** @deprecated Use mountApiRoutes instead */
export const mountCanonicalApiRoutes = mountApiRoutes;
/** @deprecated Kept for type compatibility — returns empty array */
export const getCanonicalApiRoutes = getApiRoutes;
/** @deprecated Legacy routes removed — returns empty array */
export const getLegacyApiRoutes = (_env: Env): MountedRoute[] => [];
/** @deprecated Legacy routes removed — no-op */
export const mountLegacyApiRoutes = (_app: Application, _env: Env) => {};
