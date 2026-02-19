import { NextFunction, Request, Response } from "express";

export const LEGACY_API_SUNSET = "2026-05-31";

export const legacyApiDeprecation = (req: Request, res: Response, next: NextFunction) => {
  const path = String(req.path || req.originalUrl || "");
  const isLegacyApiRoute = path === "/api" || (path.startsWith("/api/") && !path.startsWith("/api/v1/"));

  if (isLegacyApiRoute) {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", LEGACY_API_SUNSET);
  }

  next();
};
