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
type ErrorResponseOptions = {
  message: string; // Error message
  code?: string; // Error code for client-side handling
  details?: unknown; // Additional error details
  requestId?: string; // Request ID for tracing
};

/**
 * Creates an error response body object.
 *
 * This function creates a standardized error response body with:
 * - success: false
 * - message: Error message
 * - data: null
 * - code: Optional error code
 * - details: Optional error details
 * - request_id: Optional request ID
 *
 * @param {ErrorResponseOptions} options - Error response options
 * @returns {object} Error response body
 */
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

/**
 * Sends an error response.
 *
 * This function sends a standardized error response with the specified
 * status code and error body.
 *
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {ErrorResponseOptions} options - Error response options
 * @returns {Response} Express response object
 */
export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  options: ErrorResponseOptions,
) => {
  return res.status(statusCode).json(createErrorResponseBody(options));
};
