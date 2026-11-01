/**
 * @fileoverview API Key Authentication Middleware
 *
 * This middleware authenticates requests using API keys. It's an alternative to
 * JWT authentication, designed for programmatic access (SDKs, integrations, scripts).
 *
 * @module middleware/apiKeyAuth
 */

import type { RequestHandler } from "express";
import mongoose from "mongoose";

import ApiKeyModel from "../models/apiKeyModel";
import { resolveApiKey } from "../services/apiKeys";
import { fireAndForget } from "../services/deadLetterQueue";

/**
 * Extract raw API key from request headers.
 * Checks Authorization: Bearer <key> and X-API-Key: <key> headers.
 */
export function extractRawApiKey(req: { header(name: string): string | undefined }): string {
  const header = String(req.header("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token || String(req.header("x-api-key") || "").trim();
}

/**
 * Attach resolved API key metadata and org context to the request.
 * Shared by both apiKeyAuth and authAny middleware.
 */
export function attachApiKeyToRequest(req: any, key: any): void {
  req.apiKey = {
    id: String(key._id),
    orgId: String(key.orgId),
    createdByUserId: String(key.createdByUserId || ""),
    scopes: Array.isArray(key.scopes) ? key.scopes.map((s: unknown) => String(s)) : [],
    keyPrefix: String(key.keyPrefix || ""),
  };

  if (!req.org) {
    req.org = {
      orgId: String(key.orgId),
      memberId: "",
      role: "owner",
    };
  }

  // Fire-and-forget: update lastUsedAt with dead-letter queue tracking
  fireAndForget(
    ApiKeyModel.updateOne(
      { _id: new mongoose.Types.ObjectId(String(key._id)) },
      { $set: { lastUsedAt: new Date() } },
    ),
    "update_api_key_last_used",
    { apiKeyId: String(key._id) }
  );
}

/**
 * API Key Authentication Middleware
 *
 * Extracts and validates API keys from request headers.
 * Rejects requests without a valid API key.
 */
export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  try {
    const rawKey = extractRawApiKey(req);

    if (!rawKey) {
      return res.status(401).json({ message: "Missing API key", code: "API_KEY_REQUIRED", request_id: req.requestId });
    }

    const key = await resolveApiKey(rawKey);
    if (!key) {
      return res.status(401).json({ message: "Invalid API key", code: "API_KEY_INVALID", request_id: req.requestId });
    }

    attachApiKeyToRequest(req, key);
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
 */
export const requireApiKeyScope = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey as { scopes?: string[] } | undefined;

    if (!apiKey) {
      next();
      return;
    }

    const scopes = apiKey.scopes || [];
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
