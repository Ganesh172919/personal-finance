/**
 * @fileoverview API Error Handling
 *
 * Provides a structured ApiError class and a parser for HTTP error responses.
 * All API errors are normalized into ApiError instances, making error handling
 * consistent across the application.
 *
 * WHY A CUSTOM ERROR CLASS?
 * The native `Error` class only has `message`. API errors need additional
 * context: HTTP status code, error code (e.g., "FEATURE_LIMIT_REACHED"),
 * request ID (for debugging), and optional details.
 *
 * ERROR EXTRACTION PRIORITY:
 * 1. JSON response body `message` field (server-defined message)
 * 2. Fallback: "Request failed with status: {code}" (generic message)
 *
 * REQUEST ID TRACKING:
 * The server includes a request_id in error responses and as the X-Request-Id
 * header. This ID is used for error reporting and support ticket correlation.
 *
 * @module lib/apiError
 */

/**
 * Structured API error with HTTP status, error code, and request tracking.
 * Extends Error so it works with try/catch and error boundaries.
 */
export class ApiError extends Error {
  /** HTTP status code (e.g., 400, 401, 403, 402, 500) */
  status: number;
  /** Application error code (e.g., "FEATURE_LIMIT_REACHED", "CSRF_FAILED") */
  code?: string;
  /** Server request ID for debugging and support correlation */
  requestId?: string;
  /** Additional error details (validation errors, etc.) */
  details?: unknown;

  constructor(message: string, params: { status: number; code?: string; requestId?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details;
  }
}

/**
 * Parses a failed HTTP Response into an ApiError instance.
 * Attempts to extract structured error data from the JSON response body.
 *
 * @param res - The failed fetch Response (non-2xx status)
 * @returns A structured ApiError instance
 */
export async function parseApiError(res: Response): Promise<ApiError> {
  let errorData: any = null;

  // Try to parse JSON body — clone() so we don't consume the original stream
  try {
    errorData = await res.clone().json();
  } catch {
    errorData = null; // Non-JSON error response (e.g., HTML 502 page)
  }

  // Extract message: prefer server-defined message, fallback to generic
  const message =
    (errorData && typeof errorData === "object" && "message" in errorData && String((errorData as any).message)) ||
    `Request failed with status: ${res.status}`;

  // Extract request ID from body or header (server sends both)
  const requestId =
    (errorData && typeof errorData === "object" && ((errorData as any).request_id || (errorData as any).requestId)) ||
    res.headers.get("X-Request-Id") ||
    undefined;

  return new ApiError(message, {
    status: res.status,
    code: errorData && typeof errorData === "object" ? (errorData as any).code : undefined,
    requestId: requestId ? String(requestId) : undefined,
    details: errorData && typeof errorData === "object" ? (errorData as any).details : undefined,
  });
}

