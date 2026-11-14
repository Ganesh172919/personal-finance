/**
 * @fileoverview API Response Utilities
 *
 * This module provides standardized API response utilities for the Personal Finance
 * application. It includes functions for creating consistent error responses.
 *
 * KEY FEATURES:
 * - Standardized error response format
 * - Consistent response structure across all endpoints
 * - Support for error codes and details
 * - Request ID tracking in responses
 *
 * RESPONSE FORMAT:
 * {
 *   success: boolean,
 *   message: string,
 *   data: null,
 *   code?: string,
 *   details?: unknown,
 *   request_id?: string
 * }
 *
 * @module utils/apiResponse
 */

import type { Response } from "express"; // Express response type

/**
 * Error Response Options Type
 *
 * Defines the structure of error response options.
 */
// Defines configuration properties for creating structured error responses.
// Encapsulates error messages, optional error codes, diagnostic details, and trace IDs.
type ErrorResponseOptions = {
  message: string; // Error message
  code?: string; // Error code for client-side handling
  details?: unknown; // Additional error details
  requestId?: string; // Request ID for tracing
};

// Constructs a standardized JSON error response body structure.
// Injects false success status, null data payload, and optional tracking identifiers.
export const createErrorResponseBody = ({
  message,
  code,
  details,
  requestId,
}: ErrorResponseOptions) => {
  return {
    success: false as const,
    message,
    data: null,
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  };
};

// Dispatches an HTTP error response using the specified status code and formatted payload.
// Serializes the generated error body and transmits it to the calling HTTP client.
export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  options: ErrorResponseOptions,
) => {
  return res.status(statusCode).json(createErrorResponseBody(options));
};
