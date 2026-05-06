/**
 * @fileoverview Error Handling Middleware
 *
 * This module provides centralized error handling for the Express application.
 * It catches and processes various types of errors, returning appropriate HTTP
 * responses with standardized error formats.
 *
 * KEY FEATURES:
 * - Centralized error handling for all routes
 * - Standardized error response format
 * - Support for custom HTTP errors (HttpError)
 * - Zod validation error handling
 * - Mongoose validation and cast error handling
 * - Unhandled error logging and generic 500 response
 * - Request ID tracking in error responses
 *
 * ERROR TYPES HANDLED:
 * - HttpError: Custom HTTP errors with status codes
 * - ZodError: Request validation errors
 * - mongoose.Error.ValidationError: Database validation errors
 * - mongoose.Error.CastError: Invalid ID format errors
 * - All other errors: Generic 500 Internal Server Error
 *
 * @module middleware/errorHandler
 */

import { NextFunction, Request, Response } from "express"; // Express types
import mongoose from "mongoose"; // MongoDB ODM for error types
import { ZodError } from "zod"; // Zod validation error type
import { HttpError } from "./httpError"; // Custom HTTP error class
import { logger } from "../config/logger"; // Application logger
import { sendErrorResponse } from "../utils/apiResponse"; // Standardized error response utility

/**
 * 404 Not Found Handler
 *
 * This middleware handles requests to undefined routes.
 * It returns a 404 response with a standardized error format.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const notFoundHandler = (req: Request, res: Response) => {
  sendErrorResponse(res, 404, {
    message: "Route not found",
    code: "NOT_FOUND",
    requestId: req.requestId,
  });
};

/**
 * Global Error Handler
 *
 * This middleware catches all unhandled errors and returns appropriate responses.
 * It processes errors in the following order:
 * 1. HttpError: Custom HTTP errors with status codes
 * 2. ZodError: Request validation errors
 * 3. mongoose.Error.ValidationError: Database validation errors
 * 4. mongoose.Error.CastError: Invalid ID format errors
 * 5. All other errors: Generic 500 Internal Server Error
 *
 * @param {unknown} err - The error that occurred
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} _next - Express next function (unused)
 */
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // Skip if headers already sent (response already started)
  if (res.headersSent) {
    return;
  }

  // Handle custom HTTP errors
  if (err instanceof HttpError) {
    sendErrorResponse(res, err.statusCode, {
      message: err.message,
      code: err.code,
      details: err.details,
      requestId: req.requestId,
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    sendErrorResponse(res, 400, {
      message: "Invalid request payload",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      requestId: req.requestId,
    });
    return;
  }

  // Handle Mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {
    sendErrorResponse(res, 400, {
      message: "Data validation failed",
      code: "DB_VALIDATION_ERROR",
      details: err.errors,
      requestId: req.requestId,
    });
    return;
  }

  // Handle Mongoose cast errors (invalid ObjectId, etc.)
  if (err instanceof mongoose.Error.CastError) {
    sendErrorResponse(res, 400, {
      message: "Invalid identifier format",
      code: "INVALID_ID",
      details: err.message,
      requestId: req.requestId,
    });
    return;
  }

  // Log unhandled errors and return generic 500 response
  logger.error({ err, requestId: req.requestId }, "Unhandled error");
  sendErrorResponse(res, 500, {
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    requestId: req.requestId,
  });
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Centralized Error Handling**: All errors flow through this single handler.
 *    This ensures consistent error response format across the entire API.
 *
 * 2. **Error Type Hierarchy**: The handler checks error types in order of specificity:
 *    HttpError → ZodError → ValidationError → CastError → generic Error
 *
 * 3. **Headers Sent Check**: `res.headersSent` prevents writing to an already-started
 *    response (which would cause a "headers already sent" error).
 *
 * 4. **Security**: Generic 500 errors don't leak internal details. Only the error
 *    message and code are sent to the client; stack traces are logged server-side only.
 *
 * 5. **Request ID**: Every error response includes the request ID for debugging.
 *    Clients can provide this ID when reporting issues.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * errorHandler → last middleware in app.ts (catches all unhandled errors)
 * notFoundHandler → catches requests to undefined routes
 * HttpError → thrown by controllers and services for expected errors
 * ══════════════════════════════════════════════════════════════════════
 */
