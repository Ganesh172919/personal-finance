import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "./httpError";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    message: "Route not found",
    code: "NOT_FOUND",
    request_id: req.requestId
  });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      details: err.details,
      request_id: req.requestId
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Invalid request payload",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      request_id: req.requestId
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      message: "Data validation failed",
      code: "DB_VALIDATION_ERROR",
      details: err.errors,
      request_id: req.requestId
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      message: "Invalid identifier format",
      code: "INVALID_ID",
      details: err.message,
      request_id: req.requestId
    });
    return;
  }

  console.error(`[requestId=${req.requestId}] Unhandled error:`, err);
  res.status(500).json({
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    request_id: req.requestId
  });
};
