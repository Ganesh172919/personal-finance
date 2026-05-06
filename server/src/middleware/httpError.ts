/**
 * @fileoverview HTTP Error Class
 *
 * This module defines a custom HTTP error class for the Personal Finance application.
 * It extends the built-in Error class with HTTP-specific properties for standardized
 * error handling across the application.
 *
 * KEY FEATURES:
 * - Extends built-in Error class
 * - Includes HTTP status code
 * - Includes error code for client-side handling
 * - Includes optional details for validation errors
 * - Used by error handling middleware for consistent responses
 *
 * USAGE:
 * - Throw HttpError in controllers for expected errors
 * - Caught by errorHandler middleware for standardized responses
 * - Supports various HTTP status codes (400, 401, 403, 404, 500, etc.)
 *
 * @module middleware/httpError
 */

/**
 * Custom HTTP Error Class
 *
 * Extends Error with HTTP-specific properties for standardized error handling.
 *
 * @extends Error
 *
 * @example
 * // Throw a 400 Bad Request error
 * throw new HttpError(400, "VALIDATION_ERROR", "Invalid input", { field: "email" });
 *
 * @example
 * // Throw a 401 Unauthorized error
 * throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
 */
export class HttpError extends Error {
  /** HTTP status code (e.g., 400, 401, 404, 500) */
  statusCode: number;

  /** Error code for client-side handling (e.g., "VALIDATION_ERROR", "NOT_FOUND") */
  code: string;

  /** Optional additional details (e.g., validation errors, context) */
  details?: unknown;

  /**
   * Creates a new HttpError instance.
   *
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code for client-side handling
   * @param {string} message - Human-readable error message
   * @param {unknown} [details] - Optional additional details
   */
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Custom Error Classes**: Extending Error with domain-specific properties
 *    (statusCode, code, details) enables type-safe error handling in the
 *    error handler middleware.
 *
 * 2. **Error Codes vs Status Codes**: Status codes are for HTTP semantics.
 *    Error codes are for client-side logic (e.g., "VALIDATION_ERROR" can be
 *    used by the frontend to show a form error).
 *
 * 3. **Optional Details**: The `details` field carries additional context
 *    (e.g., which fields failed validation) without cluttering the message.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * HttpError → thrown by controllers, services, and middleware
 * HttpError → caught by errorHandler middleware for standardized responses
 * HttpError → used with various status codes (400, 401, 403, 404, 409, 429, etc.)
 * ══════════════════════════════════════════════════════════════════════
 */
