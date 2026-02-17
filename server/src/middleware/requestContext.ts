import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const headerRequestId = req.header("x-request-id");
  const requestId = headerRequestId && headerRequestId.trim().length > 0 ? headerRequestId : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
};
