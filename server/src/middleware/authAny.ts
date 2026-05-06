/**
 * @fileoverview Authentication Middleware (JWT and API Key)
 *
 * This module provides authentication middleware that supports both JWT tokens
 * and API keys for the Personal Finance application. It attempts JWT authentication
 * first, then falls back to API key authentication.
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
import ApiKeyModel from "../models/apiKeyModel"; // API key model
import {
  enforceFeatureLimit,
  recordFeatureUsage,
} from "../services/entitlements"; // Entitlement enforcement
import { HttpError } from "./httpError"; // Custom HTTP error class

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
        const header = String(req.header("authorization") || "");
        const token = header.startsWith("Bearer ")
          ? header.slice("Bearer ".length).trim()
          : "";
        const rawKey = token || String(req.header("x-api-key") || "").trim();

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

        // Attach API key information to request
        (req as any).apiKey = {
          id: String((key as any)._id),
          orgId: String((key as any).orgId),
          createdByUserId: String((key as any).createdByUserId || ""),
          scopes: Array.isArray((key as any).scopes)
            ? (key as any).scopes.map((s: unknown) => String(s))
            : [],
          keyPrefix: String((key as any).keyPrefix || ""),
        };

        // Set organization context if not already set
        if (!(req as any).org) {
          (req as any).org = {
            orgId: String((key as any).orgId),
            memberId: "",
            role: "owner",
          };
        }

        // Update last used timestamp (fire-and-forget)
        void ApiKeyModel.updateOne(
          { _id: (key as any)._id },
          { $set: { lastUsedAt: new Date() } },
        ).catch(() => null);

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

          // Record feature usage (fire-and-forget)
          await recordFeatureUsage({
            orgId: orgObjectId,
            userId: userObjectId,
            feature: "api_requests",
            units: 1,
            requestId: req.requestId,
            context: {
              path: req.path,
              method: req.method,
            },
          }).catch(() => null);
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
