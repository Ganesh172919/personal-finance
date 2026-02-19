import type { NextFunction, Request, Response } from "express";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const defaultErrorCode = (statusCode: number): string => {
  if (statusCode >= 500) return "INTERNAL_SERVER_ERROR";
  switch (statusCode) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 402:
      return "PAYMENT_REQUIRED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "REQUEST_FAILED";
  }
};

export const responseContext = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = ((payload: unknown) => {
    if (!isRecord(payload)) {
      return originalJson(payload);
    }

    const enriched: Record<string, unknown> = { ...payload };

    if (enriched.request_id === undefined) {
      enriched.request_id = req.requestId;
    }

    if (res.statusCode >= 400 && enriched.code === undefined) {
      enriched.code = defaultErrorCode(res.statusCode);
    }

    const orgId = String((req as any).org?.orgId || "");
    if (orgId && res.statusCode < 400 && enriched.org_id === undefined) {
      enriched.org_id = orgId;
    }

    return originalJson(enriched);
  }) as Response["json"];

  next();
};
