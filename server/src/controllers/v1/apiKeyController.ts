/**
 * @fileoverview API Key Controller (v1)
 *
 * Manages API keys for programmatic access to the organization's data.
 * API keys are scoped to an org and carry permission scopes.
 *
 * Routes served:
 *   GET    /api/v1/api-keys         - listApiKeys (admin)
 *   POST   /api/v1/api-keys         - createApiKeyForOrg (admin)
 *   DELETE /api/v1/api-keys/:id     - revokeApiKey (admin)
 *
 * Key patterns:
 *   - All endpoints require admin role
 *   - The raw secret is only returned once at creation time (never stored)
 *   - Keys are revoked by setting revokedAt (soft-delete, not hard-delete)
 *   - Key prefix stored for display purposes (e.g., "sk_abc...")
 *
 * @module controllers/v1/apiKeyController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import ApiKeyModel from "../../models/apiKeyModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createApiKey } from "../../services/apiKeys";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgAdmin = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  if (roleRank[req.org.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

export const listApiKeys = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);

  const keys = await ApiKeyModel.find({ orgId })
    .sort({ createdAt: -1 })
    .select({ name: 1, keyPrefix: 1, scopes: 1, createdAt: 1, lastUsedAt: 1, revokedAt: 1 })
    .lean();

  return res.json({
    api_keys: keys.map((key: any) => ({
      id: String(key._id),
      name: String(key.name),
      prefix: String(key.keyPrefix),
      scopes: Array.isArray(key.scopes) ? key.scopes.map((s: unknown) => String(s)) : [],
      created_at: key.createdAt,
      last_used_at: key.lastUsedAt,
      revoked_at: key.revokedAt,
    })),
    request_id: req.requestId,
  });
};

export const createApiKeyForOrg = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);

  const body = req.body as { name: string; scopes: any[] };
  const created = await createApiKey({
    orgId,
    createdByUserId: user._id,
    name: String(body.name),
    scopes: Array.isArray(body.scopes) ? (body.scopes as any) : [],
  });

  return res.status(201).json({
    api_key: created.secret,
    key: {
      id: created.id,
      prefix: created.keyPrefix,
      name: body.name,
      scopes: created.scopes,
      created_at: created.createdAt,
    },
    request_id: req.requestId,
  });
};

export const revokeApiKey = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const id = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "INVALID_KEY_ID", "Invalid api key id");
  }

  const updated = await ApiKeyModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), orgId },
    { $set: { revokedAt: new Date() } },
    { new: true }
  )
    .select({ _id: 1, revokedAt: 1 })
    .lean();

  if (!updated) {
    throw new HttpError(404, "API_KEY_NOT_FOUND", "API key not found");
  }

  return res.json({
    revoked: true,
    key_id: id,
    revoked_at: (updated as any).revokedAt,
    request_id: req.requestId,
  });
};

