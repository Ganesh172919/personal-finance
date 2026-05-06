/**
 * @fileoverview CSRF (Cross-Site Request Forgery) Protection Middleware
 *
 * This middleware implements the "Double Submit Cookie" pattern for CSRF protection.
 * It's specifically designed for applications that use HTTP-only cookies for authentication.
 *
 * HOW CSRF ATTACKS WORK:
 * 1. User is logged into site A (which uses cookies for auth)
 * 2. User visits malicious site B
 * 3. Site B makes a request to site A (browser automatically includes cookies)
 * 4. Site A thinks the request is legitimate because the cookie is present
 *
 * HOW THIS PROTECTION WORKS:
 * 1. Server sets a CSRF token in a regular (non-HTTP-only) cookie
 * 2. Client JavaScript reads this cookie and sends the token in a custom header
 * 3. Server verifies that the cookie token matches the header token
 * 4. An attacker on site B cannot read cookies from site A (same-origin policy)
 *
 * EXEMPTIONS:
 * - Safe HTTP methods (GET, HEAD, OPTIONS) are always allowed (they don't change state)
 * - Webhook endpoints are exempt (they use signature verification instead)
 * - Usage event endpoints are exempt (they use internal token authentication)
 *
 * @module middleware/csrfProtection
 */

import type { RequestHandler } from "express";
import { getEnv } from "../config/env";

// Safe HTTP methods that don't modify state (no CSRF protection needed)
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF Protection Middleware
 *
 * Implements Double Submit Cookie pattern for CSRF prevention.
 * Only active when CSRF_ENABLED=true (defaults to true in production).
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  const env = getEnv();

  // Skip CSRF protection if disabled in configuration
  if (!env.CSRF_ENABLED) {
    return next();
  }

  // Skip CSRF for webhook and usage event endpoints
  // Webhooks use signature verification; usage events use internal tokens
  const path = String(req.originalUrl || req.url || "");
  if (
    path.startsWith("/api/v1/billing/webhook") ||  // Stripe webhook (has signature verification)
    path.startsWith("/api/usage-events") ||         // Usage tracking (internal token)
    path.startsWith("/api/v1/usage-events")         // Usage tracking (internal token)
  ) {
    return next();
  }

  // Safe methods (GET, HEAD, OPTIONS) don't modify state, so no CSRF check needed
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // Only enforce CSRF when the user is authenticated via JWT cookie
  // API key authentication doesn't need CSRF protection (keys aren't cookies)
  const hasJwtCookie = Boolean(req.cookies?.jwt);
  if (!hasJwtCookie) {
    return next();
  }

  // Double Submit Cookie validation:
  // Compare the CSRF token from the cookie with the token from the request header
  const cookieName = env.CSRF_COOKIE_NAME;  // Default: "csrf_token"
  const cookieToken = req.cookies?.[cookieName];   // Set by server, readable by JS
  const headerToken = req.header("x-csrf-token");  // Sent by client JavaScript

  // Both tokens must exist and match
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      message: "CSRF token missing or invalid",
      code: "CSRF_FAILED",
      request_id: req.requestId,
    });
  }

  next();
};
