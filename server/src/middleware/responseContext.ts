/**
 * @fileoverview Response Context Middleware
 *
 * This middleware enriches all JSON responses with contextual metadata.
 * It wraps Express's res.json() method to automatically add:
 * - request_id: For request tracing and debugging
 * - code: Error code for client-side error handling (on error responses)
 * - org_id: Organization context (on successful responses)
 *
 * WHY WRAP res.json()?
 * Instead of manually adding these fields in every controller, this middleware
 * ensures consistent response structure across the entire API. This is the
 * "Decorator Pattern" applied to HTTP responses.
 *
 * RESPONSE ENRICHMENT RULES:
 * 1. request_id: Always added if not already present
 * 2. code: Added to error responses (4xx, 5xx) if not already present
 * 3. org_id: Added to successful responses (< 400) if org context exists
 *
 * @module middleware/responseContext
 */

import type { NextFunction, Request, Response } from "express";

/**
 * Type guard to check if a value is a plain object (not array, not null).
 * Used to safely spread and enrich response payloads.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Maps HTTP status codes to human-readable error codes.
 * Used as a fallback when controllers don't specify an error code.
 *
 * @param statusCode - HTTP status code
 * @returns Error code string (e.g., "BAD_REQUEST", "NOT_FOUND")
 */
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

/**
 * Response Context Middleware
 *
 * Wraps res.json() to automatically enrich JSON responses with:
 * - request_id (for tracing)
 * - error code (for error responses)
 * - org_id (for successful responses)
 *
 * This middleware uses the "Monkey Patching" pattern to wrap res.json().
 * It replaces the original method with an enhanced version that adds
 * context before delegating to the original.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const responseContext = (req: Request, res: Response, next: NextFunction) => {
  // Save reference to the original res.json() method
  const originalJson = res.json.bind(res);

  // Replace res.json() with an enriched version
  res.json = ((payload: unknown) => {
    // Only enrich plain objects (not arrays, strings, etc.)
    if (!isRecord(payload)) {
      return originalJson(payload);
    }

    // Create a copy to avoid mutating the original payload
    const enriched: Record<string, unknown> = { ...payload };

    // Add request_id if not already present (for request tracing)
    if (enriched.request_id === undefined) {
      enriched.request_id = req.requestId;
    }

    // Add error code for error responses (4xx, 5xx)
    if (res.statusCode >= 400 && enriched.code === undefined) {
      enriched.code = defaultErrorCode(res.statusCode);
    }

    // Add org_id for successful responses (when org context is available)
    const orgId = String((req as any).org?.orgId || "");
    if (orgId && res.statusCode < 400 && enriched.org_id === undefined) {
      enriched.org_id = orgId;
    }

    // Delegate to the original res.json() with the enriched payload
    return originalJson(enriched);
  }) as Response["json"];

  next();
};
