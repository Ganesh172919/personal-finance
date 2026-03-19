import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "./httpError";
import { logger } from "../config/logger";
import { sendErrorResponse } from "../utils/apiResponse";

export const notFoundHandler = (req: Request, res: Response) => {
  sendErrorResponse(res, 404, {
    message: "Route not found",
    code: "NOT_FOUND",
    requestId: req.requestId,
  });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    sendErrorResponse(res, err.statusCode, {
      message: err.message,
      code: err.code,
      details: err.details,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    sendErrorResponse(res, 400, {
      message: "Invalid request payload",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    sendErrorResponse(res, 400, {
      message: "Data validation failed",
      code: "DB_VALIDATION_ERROR",
      details: err.errors,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    sendErrorResponse(res, 400, {
      message: "Invalid identifier format",
      code: "INVALID_ID",
      details: err.message,
      requestId: req.requestId,
    });
    return;
  }

  logger.error({ err, requestId: req.requestId }, "Unhandled error");
  sendErrorResponse(res, 500, {
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    requestId: req.requestId,
  });
};
