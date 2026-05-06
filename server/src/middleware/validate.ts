/**
 * @fileoverview Request Validation Middleware
 *
 * This module provides request validation middleware using Zod schemas.
 * It validates request body, URL parameters, and query parameters against
 * defined schemas and replaces the original values with parsed/validated data.
 *
 * KEY FEATURES:
 * - Validates request body, params, and query against Zod schemas
 * - Replaces original values with parsed/validated data
 * - Returns 400 error with detailed validation messages
 * - Type-safe validation with TypeScript
 * - Supports partial validation (only validate what's needed)
 *
 * USAGE:
 * - Used in route definitions to validate incoming requests
 * - Supports body, params, and query validation
 * - Returns standardized error responses for validation failures
 *
 * @module middleware/validate
 */

import { NextFunction, Request, RequestHandler, Response } from "express"; // Express types
import { ZodError, ZodTypeAny } from "zod"; // Zod validation types
import { HttpError } from "./httpError"; // Custom HTTP error class

/**
 * Validation Schemas Type
 *
 * Defines the schemas for validating different parts of the request.
 */
type ValidationSchemas = {
  body?: ZodTypeAny; // Schema for request body
  params?: ZodTypeAny; // Schema for URL parameters
  query?: ZodTypeAny; // Schema for query parameters
};

/**
 * Parses and validates a value against a Zod schema.
 *
 * @template T - The expected output type
 * @param {ZodTypeAny | undefined} schema - Zod schema to validate against
 * @param {unknown} value - Value to validate
 * @param {"body" | "params" | "query"} part - Part of request being validated
 * @returns {T | undefined} Validated data or undefined if no schema
 * @throws {HttpError} If validation fails
 */
const parseSchema = <T>(
  schema: ZodTypeAny | undefined,
  value: unknown,
  part: "body" | "params" | "query"
): T | undefined => {
  // Skip validation if no schema provided
  if (!schema) {
    return undefined;
  }

  // Validate value against schema
  const result = schema.safeParse(value);
  if (!result.success) {
    // Throw HTTP 400 error with validation details
    throw new HttpError(400, "VALIDATION_ERROR", `Invalid ${part}`, result.error.flatten());
  }

  return result.data as T;
};

/**
 * Validation Middleware Factory
 *
 * Creates a middleware function that validates request parts against Zod schemas.
 *
 * @param {ValidationSchemas} schemas - Object containing validation schemas
 * @returns {RequestHandler} Express middleware function
 *
 * @example
 * // Validate request body
 * router.post('/users', validate({ body: userSchema }), createUser);
 *
 * @example
 * // Validate URL params and query
 * router.get('/users/:id', validate({ params: idSchema, query: filterSchema }), getUser);
 */
export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Parse and validate each part of the request
      const parsedBody = parseSchema(schemas.body, req.body, "body");
      const parsedParams = parseSchema(schemas.params, req.params, "params");
      const parsedQuery = parseSchema(schemas.query, req.query, "query");

      // Replace request body with validated data
      if (parsedBody) {
        req.body = parsedBody;
      }

      // Replace URL parameters with validated data
      if (parsedParams) {
        Object.assign(req.params as Record<string, unknown>, parsedParams as Record<string, unknown>);
      }

      // Replace query parameters with validated data
      if (parsedQuery) {
        const currentQuery = req.query as Record<string, unknown>;
        // Clear existing query parameters
        for (const key of Object.keys(currentQuery)) {
          delete currentQuery[key];
        }
        // Assign validated query parameters
        Object.assign(currentQuery, parsedQuery as Record<string, unknown>);
      }

      // Continue to next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        next(new HttpError(400, "VALIDATION_ERROR", "Invalid request payload", error.flatten()));
        return;
      }
      // Pass other errors to error handler
      next(error);
    }
  };
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Middleware Factory Pattern**: `validate()` returns a middleware function,
 *    allowing schema configuration at route definition time.
 *
 * 2. **Input Sanitization**: After validation, the original request data is
 *    replaced with the parsed (and potentially transformed) data. This ensures
 *    controllers always work with validated data.
 *
 * 3. **Partial Validation**: You can validate just body, just params, or just
 *    query — not all three are required. This is flexible for different endpoints.
 *
 * 4. **Zod safeParse**: Using safeParse instead of parse avoids throwing exceptions.
 *    The error is caught and converted to an HttpError for consistent handling.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * validate() → used in route definitions: router.post('/users', validate({ body: schema }), handler)
 * validate() → throws HttpError on validation failure → caught by errorHandler
 * validate() → replaces req.body/params/query with validated data
 * ══════════════════════════════════════════════════════════════════════
 */
