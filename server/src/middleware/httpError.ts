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

// Custom application error class augmenting standard errors with HTTP status codes and error keys.
// Provides standardized exception data structures consumed by global Express error-handling middleware.
export class HttpError extends Error {
  /** HTTP status code (e.g., 400, 401, 404, 500) */
  statusCode: number;

  /** Error code for client-side handling (e.g., "VALIDATION_ERROR", "NOT_FOUND") */
  code: string;

  /** Optional additional details (e.g., validation errors, context) */
  details?: unknown;

  // Initializes an HttpError instance with status codes, machine-readable keys, and diagnostic details.
  // Calls the super Error constructor with the human-readable error description message.
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
