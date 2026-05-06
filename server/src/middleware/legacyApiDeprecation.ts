/**
 * @fileoverview Legacy API Deprecation Middleware
 *
 * This middleware adds deprecation headers to responses from legacy API endpoints.
 * The FinWise API is migrating from /api/* to /api/v1/* and this middleware helps
 * clients identify which endpoints they should stop using.
 *
 * DEPRECATION STRATEGY:
 * - Legacy routes are mounted at /api/* (e.g., /api/auth/login)
 * - New canonical routes are at /api/v1/* (e.g., /api/v1/auth/login)
 * - Both routes work during the deprecation window
 * - After the sunset date, legacy routes will be removed
 *
 * HTTP DEPRECATION HEADERS (RFC 8594):
 * - Deprecation: true — marks the response as deprecated
 * - Sunset: <date> — indicates when the endpoint will be removed
 *
 * CLIENT MIGRATION:
 * Clients should update their API calls from /api/* to /api/v1/* before the
 * sunset date. The response headers serve as a programmatic reminder.
 *
 * @module middleware/legacyApiDeprecation
 */

import { NextFunction, Request, Response } from "express";

// The date after which legacy /api/* routes will be removed
export const LEGACY_API_SUNSET = "2026-05-31";

/**
 * Legacy API Deprecation Middleware
 *
 * Adds Deprecation and Sunset headers to responses from legacy API routes.
 * Routes starting with /api/v1/ are not considered legacy and are skipped.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const legacyApiDeprecation = (req: Request, res: Response, next: NextFunction) => {
  const path = String(req.path || req.originalUrl || "");

  // Identify legacy API routes: /api or /api/* but NOT /api/v1/*
  const isLegacyApiRoute = path === "/api" || (path.startsWith("/api/") && !path.startsWith("/api/v1/"));

  if (isLegacyApiRoute) {
    // RFC 8594 Deprecation header
    res.setHeader("Deprecation", "true");
    // RFC 8594 Sunset header — when the endpoint will be removed
    res.setHeader("Sunset", LEGACY_API_SUNSET);
  }

  next();
};
