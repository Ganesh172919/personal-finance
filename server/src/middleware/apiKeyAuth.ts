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

// Parses raw API key tokens from Bearer authorization headers or fallback x-api-key headers.
// Returns the trimmed token string or an empty string if no API key header is present.
export function extractRawApiKey(req: { header(name: string): string | undefined }): string {
  const header = String(req.header("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token || String(req.header("x-api-key") || "").trim();
}

// Decorates the Express request object with validated API key metadata and synthetic org context.
// Asynchronously triggers a fire-and-forget background update to refresh key lastUsedAt timestamps.
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

// Express middleware verifying that incoming requests supply a registered and unrevoked API key.
// Returns 401 Unauthorized for missing or invalid keys and forwards valid requests to next handlers.
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

// Middleware factory generating scope verification guards for API key authenticated routes.
// Rejects requests with 403 Forbidden if the authenticated API key lacks the required scope permission.
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
