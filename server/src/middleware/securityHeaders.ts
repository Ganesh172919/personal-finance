/**
 * @fileoverview Security Headers Middleware
 *
 * Applies defense-in-depth HTTP security headers without requiring the `helmet`
 * dependency. This middleware works alongside helmet to provide additional
 * security headers specific to API servers.
 *
 * DEFENSE IN DEPTH:
 * Security headers provide multiple layers of protection. Even if one layer
 * is bypassed, others remain. This is a core security principle.
 *
 * HEADERS SET:
 * - X-Content-Type-Options: Prevents MIME-type sniffing attacks
 * - X-Frame-Options: Prevents clickjacking (embedding in iframes)
 * - X-XSS-Protection: Disabled (modern browsers use CSP instead)
 * - Referrer-Policy: Controls what URL information is shared with external sites
 * - Permissions-Policy: Disables unnecessary browser features (camera, mic, etc.)
 * - Content-Security-Policy: Controls which resources can be loaded
 * - Cache-Control: Prevents caching of sensitive API responses
 * - Strict-Transport-Security: Forces HTTPS (production only)
 *
 * @module middleware/securityHeaders
 */

import type { RequestHandler } from "express";

/**
 * Configuration options for the security headers middleware.
 */
export interface SecurityHeadersOptions {
  /** Enable HSTS header (set true for production behind HTTPS) */
  hsts?: boolean;
  /** Max-age for HSTS in seconds (default: 1 year = 31536000) */
  hstsMaxAge?: number;
  /** Custom CSP directive (default: restrictive API policy) */
  contentSecurityPolicy?: string;
  /** Allowed frame ancestors (default: 'none') */
  frameAncestors?: string;
}

/**
 * Creates a middleware that sets security-related HTTP headers.
 *
 * This is a factory function that returns a middleware configured with
 * the provided options. This pattern allows per-environment configuration.
 *
 * @param options - Security header configuration
 * @returns Express middleware function
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): RequestHandler {
  const {
    hsts = false,                    // HSTS disabled by default (only for HTTPS)
    hstsMaxAge = 31536000,           // 1 year in seconds
    contentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'", // Restrictive default
    frameAncestors = "'none'",       // No framing allowed by default
  } = options;

  return (_req, res, next) => {
    // Prevent browsers from MIME-type sniffing (reduces exposure to drive-by downloads)
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking by blocking iframe embedding
    res.setHeader("X-Frame-Options", "DENY");

    // Disable XSS filter (modern browsers use CSP instead; old filter had bypasses)
    res.setHeader("X-XSS-Protection", "0");

    // Control referrer information sent to external sites
    // "strict-origin-when-cross-origin": full URL for same-origin, only origin for cross-origin
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Disable unnecessary browser features for API responses
    // This prevents abuse if a response is ever rendered as HTML
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );

    // Content Security Policy (skip if empty — helmet handles it in app.ts)
    if (contentSecurityPolicy) {
      res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    }

    // Prevent caching of authenticated responses (contains sensitive data)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache"); // HTTP/1.0 backward compatibility

    // HSTS: Force browsers to use HTTPS for future requests (production only)
    // WARNING: Only enable this when your site is fully HTTPS-enabled
    if (hsts) {
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${hstsMaxAge}; includeSubDomains; preload`,
      );
    }

    // Remove X-Powered-By header (reveals Express.js, aids attackers in fingerprinting)
    res.removeHeader("X-Powered-By");

    next();
  };
}
