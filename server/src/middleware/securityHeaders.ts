/**
 * Security Headers Middleware
 *
 * Applies defense-in-depth HTTP security headers without
 * requiring the `helmet` dependency. Covers OWASP Top 10 header
 * recommendations for API servers.
 */

import type { RequestHandler } from "express";

export interface SecurityHeadersOptions {
  /** Enable HSTS header (set true for production behind HTTPS) */
  hsts?: boolean;
  /** Max-age for HSTS in seconds (default: 1 year) */
  hstsMaxAge?: number;
  /** Custom CSP directive (default: restrictive API policy) */
  contentSecurityPolicy?: string;
  /** Allowed frame ancestors (default: 'none') */
  frameAncestors?: string;
}

export function securityHeaders(options: SecurityHeadersOptions = {}): RequestHandler {
  const {
    hsts = false,
    hstsMaxAge = 31536000,
    contentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'",
    frameAncestors = "'none'",
  } = options;

  return (_req, res, next) => {
    // Prevent MIME-type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Clickjacking protection
    res.setHeader("X-Frame-Options", "DENY");

    // XSS filter (legacy browsers)
    res.setHeader("X-XSS-Protection", "0");

    // Referrer policy — don't leak internal URLs
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions policy — disable device features for API
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );

    // Content Security Policy (skip if empty — helmet handles it)
    if (contentSecurityPolicy) {
      res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    }

    // Prevent caching of authenticated responses
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");

    // HSTS (only in production or when explicitly enabled)
    if (hsts) {
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${hstsMaxAge}; includeSubDomains; preload`,
      );
    }

    // Remove powered-by header
    res.removeHeader("X-Powered-By");

    next();
  };
}
