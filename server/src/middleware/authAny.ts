/**
 * @fileoverview Authentication Middleware (JWT and API Key)
 *
 * This module provides authentication middleware that supports both JWT tokens
 * and API keys for the Personal Finance application. It attempts JWT authentication
 * first, then falls back to API key authentication.
 *
 * ============================================================================
 * MINDMAP FLOW: DUAL-AUTHENTICATION GATEWAY & CONTEXT ATTACHMENT
 * ============================================================================
 * - Dual Authentication Gateway
 *     ├── 1. Inbound Request Inspection
 *     │   ├── Bearer JWT Header or Session Cookie
 *     │   └── API Key Header (Authorization: Bearer pk_live_... or X-API-Key)
 *     ├── 2. Primary Route: Stateless JWT Authentication
 *     │   ├── Passport.js JWT strategy verification
 *     │   ├── Secret signature validation & expiry check
 *     │   ├── User document hydration -> req.user
 *     │   └── Direct short-circuit to next() on success
 *     ├── 3. Secondary Route: API Key Resolution Fallback
 *     │   ├── Token extraction via extractRawApiKey()
 *     │   ├── Database resolution via resolveApiKey()
 *     │   ├── Revocation / expiration check
 *     │   └── Key metadata attachment via attachApiKeyToRequest()
 *     ├── 4. Entitlements & Metering Engine
 *     │   ├── Tier quota evaluation via enforceFeatureLimit()
 *     │   └── Usage telemetry recording via recordFeatureUsage()
 *     └── 5. Context Injection & Error Triaging
 *         ├── req.org & req.apiKey metadata attachment
 *         ├── 401 UNAUTHORIZED if both credentials absent
 *         ├── 401 API_KEY_INVALID if revoked or expired
 *         └── 429 QUOTA_EXCEEDED if organization limits reached
 *
 * ============================================================================
 * ASCII FLOW: DUAL-STACK AUTHENTICATION LIFECYCLE
 * ============================================================================
 *                       [ Incoming API Request ]
 *                                  |
 *                                  v
 *                  +-------------------------------+
 *                  | Attempt Passport JWT Strategy |
 *                  +---------------+---------------+
 *                                  |
 *                        Did JWT Validate?
 *                             /         \
 *                      Yes   /           \ No / Absent
 *                           v             v
 *                 +-----------------+  +-------------------------------+
 *                 | req.user = user |  | Extract API Key from:         |
 *                 | Call next()     |  | - Authorization: Bearer       |
 *                 +-----------------+  | - X-API-Key header            |
 *                                      +---------------+---------------+
 *                                                      |
 *                                             Was API Key Provided?
 *                                                   /     \
 *                                            Yes   /       \ No
 *                                                 v         v
 *                 +---------------------------------+  +--------------------+
 *                 | resolveApiKey(rawKey)           |  | Return 401         |
 *                 +---------------+-----------------+  | code: UNAUTHORIZED |
 *                                 |                    +--------------------+
 *                        Is API Key Valid & Active?
 *                               /      \
 *                        Yes   /        \ No
 *                             v          v
 *                 +--------------------+  +-------------------------+
 *                 | attachApiKeyToReq  |  | Return 401              |
 *                 | enforceLimits()    |  | code: API_KEY_INVALID   |
 *                 | recordUsage()      |  +-------------------------+
 *                 | Call next()        |
 *                 +--------------------+
 *
 * KEY FEATURES:
 * - Dual authentication support (JWT and API key)
 * - JWT authentication via Passport.js
 * - API key authentication with scope validation
 * - Feature limit enforcement for API keys
 * - Usage tracking for API keys
 * - Organization context setup for API keys
 *
 * AUTHENTICATION FLOW:
 * 1. Attempt JWT authentication via Passport.js
 * 2. If JWT fails, extract API key from Authorization or X-API-Key header
 * 3. Validate API key and attach to request
 * 4. Enforce feature limits and record usage
 * 5. Set organization context if not already set
 *
 * @module middleware/authAny
 */

import type { RequestHandler } from "express"; // Express types
import mongoose from "mongoose"; // MongoDB ODM

import passport from "../config/passport"; // Passport.js configuration
import { resolveApiKey } from "../services/apiKeys"; // API key resolution service
import {
  enforceFeatureLimit,
  recordFeatureUsage,
} from "../services/entitlements"; // Entitlement enforcement
import { HttpError } from "./httpError"; // Custom HTTP error class
import { extractRawApiKey, attachApiKeyToRequest } from "./apiKeyAuth"; // Shared API key utilities
import { fireAndForget } from "../services/deadLetterQueue";

/**
 * Authentication Middleware (JWT and API Key)
 *
 * Attempts to authenticate requests using JWT tokens or API keys.
 * Supports both authentication methods for flexibility.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const authAny: RequestHandler = (req, res, next) => {
  // Attempt JWT authentication first
  passport.authenticate(
    "jwt",
    { session: false },
    async (err: unknown, user: unknown) => {
      try {
        // Handle JWT authentication errors
        if (err) {
          next(err);
          return;
        }

        // If JWT authentication succeeded, attach user and continue
        if (user) {
          (req as any).user = user;
          next();
          return;
        }

        // JWT authentication failed, try API key authentication
        const rawKey = extractRawApiKey(req);

        // If no API key provided, return 401
        if (!rawKey) {
          res
            .status(401)
            .json({
              message: "Unauthorized",
              code: "UNAUTHORIZED",
              request_id: req.requestId,
            });
          return;
        }

        // Resolve and validate API key
        const key = await resolveApiKey(rawKey);
        if (!key) {
          res
            .status(401)
            .json({
              message: "Invalid API key",
              code: "API_KEY_INVALID",
              request_id: req.requestId,
            });
          return;
        }

        // Attach API key metadata and org context (shared utility)
        attachApiKeyToRequest(req, key);

        // Enforce feature limits and record usage
        const createdByUserId = String((key as any).createdByUserId || "");
        const orgId = String((key as any).orgId || "");
        if (
          mongoose.Types.ObjectId.isValid(createdByUserId) &&
          mongoose.Types.ObjectId.isValid(orgId)
        ) {
          const orgObjectId = new mongoose.Types.ObjectId(orgId);
          const userObjectId = new mongoose.Types.ObjectId(createdByUserId);

          // Enforce quota BEFORE recording usage — block if limit exhausted
          try {
            await enforceFeatureLimit({
              orgId: orgObjectId,
              userId: userObjectId,
              feature: "api_requests",
              units: 1,
              requestId: req.requestId,
            });
          } catch (enforceError) {
            // Handle quota exceeded errors
            if (
              enforceError instanceof HttpError &&
              enforceError.statusCode === 402
            ) {
              res.status(402).json({
                message: enforceError.message,
                code: enforceError.code,
                details: enforceError.details,
                request_id: req.requestId,
              });
              return;
            }
            throw enforceError;
          }

          // Record feature usage (fire-and-forget with DLQ tracking)
          fireAndForget(
            recordFeatureUsage({
              orgId: orgObjectId,
              userId: userObjectId,
              feature: "api_requests",
              units: 1,
              requestId: req.requestId,
              context: {
                path: req.path,
                method: req.method,
              },
            }),
            "record_feature_usage",
            { orgId: String(orgObjectId), userId: String(userObjectId) },
          );
        }

        // Continue to next middleware
        next();
      } catch (error) {
        next(error);
      }
    },
  )(req, res, next);
};

/**
 * Requires specific API key scope (if API key is used).
 *
 * This middleware checks if the API key has the required scope.
 * If JWT authentication is used, this middleware passes through.
 *
 * @param {string} scope - Required scope name
 * @returns {RequestHandler} Express middleware function
 */
export const requireScopeIfApiKey = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey as { scopes?: string[] } | undefined;

    // If no API key (JWT auth), skip scope check
    if (!apiKey) {
      next();
      return;
    }

    // Check if API key has required scope
    const scopes = apiKey.scopes || [];
    if (!scopes.includes(scope)) {
      res.status(403).json({
        message: "Missing required API key scope",
        code: "API_KEY_SCOPE_REQUIRED",
        details: { scope },
        request_id: req.requestId,
      });
      return;
    }

    next();
  };
};
