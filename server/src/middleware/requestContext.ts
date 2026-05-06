/**
 * @fileoverview Request Context Middleware
 *
 * This middleware attaches a unique request ID to each incoming request.
 * It uses the X-Request-Id header if provided, otherwise generates a new UUID.
 *
 * KEY FEATURES:
 * - Extracts request ID from X-Request-Id header
 * - Generates new UUID if header is not present
 * - Attaches request ID to request object for use in other middleware/routes
 * - Sets X-Request-Id response header for client-side tracing
 *
 * USAGE:
 * - Used for request tracing across distributed systems
 * - Included in log entries for correlation
 * - Returned in error responses for debugging
 *
 * @module middleware/requestContext
 */

import { randomUUID } from "crypto"; // Node.js crypto module for UUID generation
import { NextFunction, Request, Response } from "express"; // Express types

/**
 * Request Context Middleware
 *
 * Attaches a unique request ID to each request and response.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  // Get request ID from header or generate new one
  const headerRequestId = req.header("x-request-id");
  const requestId = headerRequestId && headerRequestId.trim().length > 0 ? headerRequestId : randomUUID();

  // Attach request ID to request object
  req.requestId = requestId;

  // Set request ID in response header
  res.setHeader("X-Request-Id", requestId);

  // Continue to next middleware
  next();
};
