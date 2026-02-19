import type { RequestHandler } from "express";
import { getEnv } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrfProtection: RequestHandler = (req, res, next) => {
  const env = getEnv();
  if (!env.CSRF_ENABLED) {
    return next();
  }

  const path = String(req.originalUrl || req.url || "");
  if (
    path.startsWith("/api/v1/billing/webhook") ||
    path.startsWith("/api/usage-events") ||
    path.startsWith("/api/v1/usage-events")
  ) {
    return next();
  }

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const hasJwtCookie = Boolean((req as any).cookies?.jwt);
  if (!hasJwtCookie) {
    return next();
  }

  const cookieName = env.CSRF_COOKIE_NAME;
  const cookieToken = (req as any).cookies?.[cookieName];
  const headerToken = req.header("x-csrf-token");

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      message: "CSRF token missing or invalid",
      code: "CSRF_FAILED",
      request_id: req.requestId,
    });
  }

  next();
};
