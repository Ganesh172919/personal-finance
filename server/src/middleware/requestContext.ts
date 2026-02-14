import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const headerRequestId = req.header("x-request-id");
  const requestId = headerRequestId && headerRequestId.trim().length > 0 ? headerRequestId : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = Date.now();
  console.info(`[requestId=${requestId}] ${req.method} ${req.originalUrl} started`);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.info(
      `[requestId=${requestId}] ${req.method} ${req.originalUrl} completed status=${res.statusCode} durationMs=${durationMs}`
    );
  });

  next();
};
