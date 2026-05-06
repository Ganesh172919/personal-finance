/**
 * @fileoverview Optional JWT Authentication Middleware
 *
 * This middleware attempts to authenticate the request using a JWT cookie,
 * but does NOT reject unauthenticated requests. It's a "soft" authentication
 * that enriches the request with user context when available.
 *
 * WHY OPTIONAL AUTH?
 * Some middleware (like rate limiting) works better when it knows the user's identity.
 * For example, rate limiting can use user ID instead of IP address for authenticated
 * users, providing more accurate and fair rate limiting.
 *
 * This middleware runs early in the middleware stack (before orgContext and routes)
 * so that downstream middleware can access req.user if a valid JWT is present.
 *
 * DISTINCTION FROM authAny:
 * - optionalJwtAuth: Never rejects. Just attaches user if JWT is valid.
 * - authAny: Rejects with 401 if no valid authentication is found.
 *
 * @module middleware/optionalJwtAuth
 */

import type { RequestHandler } from "express";
import passport from "../config/passport";

/**
 * Optional JWT Authentication Middleware
 *
 * Uses Passport's custom callback to handle authentication without rejecting.
 * The key difference from standard passport.authenticate() is that this middleware
 * calls next() regardless of whether authentication succeeds.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const optionalJwtAuth: RequestHandler = (req, res, next) => {
  passport.authenticate(
    "jwt",
    { session: false }, // Don't use Passport sessions (we use stateless JWT)
    (err: unknown, user: unknown) => {
      if (err) {
        next(err); // Pass authentication errors to error handler
        return;
      }
      if (user) {
        (req as any).user = user; // Attach user to request (if JWT was valid)
      }
      // Always continue to next middleware (even if no user)
      next();
    }
  )(req, res, next);
};
