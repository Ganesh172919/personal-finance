/**
 * @fileoverview API Key Authentication Middleware
 *
 * This middleware authenticates requests using API keys. It's an alternative to
 * JWT authentication, designed for programmatic access (SDKs, integrations, scripts).
 *
 * API KEY AUTHENTICATION FLOW:
 * 1. Extract API key from Authorization header (Bearer token) or X-API-Key header
 * 2. Hash the key and look it up in the database
 * 3. Attach API key metadata (orgId, scopes, etc.) to the request
 * 4. Update the key's lastUsedAt timestamp (fire-and-forget)
 *
 * API KEY vs JWT:
 * - JWT: Cookie-based, for browser users, CSRF protection needed
 * - API Key: Header-based, for programmatic access, no CSRF needed
 * - API keys have scopes that limit what operations they can perform
 *
 * SECURITY:
 * - API keys are stored as hashes (not plaintext) in the database
 * - The key prefix (first few chars) is stored for identification
 * - Keys can be scoped to limit access to specific operations
 *
 * @module middleware/apiKeyAuth
 */

import type { RequestHandler } from "express";
import mongoose from "mongoose";

import ApiKeyModel from "../models/apiKeyModel";
import { resolveApiKey } from "../services/apiKeys";

/**
 * API Key Authentication Middleware
 *
 * Extracts and validates API keys from request headers.
 * Rejects requests without a valid API key.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  try {
    // Extract API key from Authorization header (Bearer token) or X-API-Key header
    const header = String(req.header("authorization") || "");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    const rawKey = token || String(req.header("x-api-key") || "").trim();

    // Reject if no API key provided
    if (!rawKey) {
      return res.status(401).json({ message: "Missing API key", code: "API_KEY_REQUIRED", request_id: req.requestId });
    }

    // Hash the key and look it up in the database
    const key = await resolveApiKey(rawKey);
    if (!key) {
      return res.status(401).json({ message: "Invalid API key", code: "API_KEY_INVALID", request_id: req.requestId });
    }

    // Attach API key metadata to the request for downstream middleware/controllers
    (req as any).apiKey = {
      id: String((key as any)._id),
      orgId: String((key as any).orgId),
      createdByUserId: String((key as any).createdByUserId || ""),
      scopes: Array.isArray((key as any).scopes) ? (key as any).scopes.map((s: unknown) => String(s)) : [],
      keyPrefix: String((key as any).keyPrefix || ""),
    };

    // Set organization context if not already set by orgContext middleware
    // API keys are associated with an organization, so we use that as the org context
    if (!(req as any).org) {
      (req as any).org = {
        orgId: String((key as any).orgId),
        memberId: "",        // API keys don't have a membership ID
        role: "owner",       // API keys are treated as owners for permission purposes
      };
    }

    // Update lastUsedAt timestamp (fire-and-forget, don't block the request)
    void ApiKeyModel.updateOne(
      { _id: new mongoose.Types.ObjectId((key as any)._id) },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => null);

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware factory that requires a specific API key scope.
 *
 * If the request is authenticated via JWT (not API key), this middleware
 * passes through without checking scopes. Scopes only apply to API keys.
 *
 * @param scope - The required scope name (e.g., "read:transactions", "write:accounts")
 * @returns Express middleware that checks for the required scope
 */
export const requireApiKeyScope = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey as { scopes?: string[] } | undefined;
    const scopes = apiKey?.scopes || [];

    // If no API key (JWT auth), skip scope check
    if (!apiKey) {
      next();
      return;
    }

    // Check if the API key has the required scope
    if (!scopes.includes(scope)) {
      return res.status(403).json({
        message: "Missing required API key scope",
        code: "API_KEY_SCOPE_REQUIRED",
        details: { scope },
        request_id: req.requestId,
      });
    }
    next();
  };
};
