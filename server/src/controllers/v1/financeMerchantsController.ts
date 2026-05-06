/**
 * @fileoverview Finance Merchants Controller (v1)
 *
 * Manages the merchant directory for an organization. Merchants normalize
 * transaction descriptions (e.g., "STARBUCKS #1234" -> "Starbucks") and
 * provide default category assignments.
 *
 * Routes served:
 *   GET /api/v1/finance/merchants - listMerchants (searchable)
 *   PUT /api/v1/finance/merchants - upsertMerchant (admin)
 *
 * Key patterns:
 *   - Merchant names normalized to lowercase, stripped of special chars
 *   - Upsert keyed on normalizedName (not the raw name)
 *   - Aliases merged via $addToSet to prevent duplicates
 *   - Search matches name, normalizedName, and aliases via regex
 *   - List readable by any org member; upsert requires admin role
 *
 * @module controllers/v1/financeMerchantsController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import MerchantModel from "../../models/merchantModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

// Normalizes merchant names for consistent matching: lowercase, collapse whitespace,
// strip non-alphanumeric chars (except &.-), truncate to 160 chars
const normalizeMerchantName = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  const squashed = trimmed.replace(/\s+/g, " ");
  const stripped = squashed.replace(/[^a-z0-9 &.-]+/g, "");
  return stripped.trim().slice(0, 160);
};

const mapMerchant = (merchant: any) => ({
  id: String(merchant._id),
  name: String(merchant.name || ""),
  normalized_name: String(merchant.normalizedName || ""),
  category_default: merchant.categoryDefault ? String(merchant.categoryDefault) : null,
  aliases: Array.isArray(merchant.aliases) ? merchant.aliases.map((a: unknown) => String(a)) : [],
  metadata: merchant.metadata || {},
  created_at: merchant.createdAt || null,
  updated_at: merchant.updatedAt || null,
});

export const listMerchants = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const query = req.query as { q?: string; limit?: unknown };
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

  const q = typeof query.q === "string" ? query.q.trim() : "";
  const filter: Record<string, unknown> = { orgId };
  if (q) {
    const needle = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: needle, $options: "i" } },
      { normalizedName: { $regex: needle, $options: "i" } },
      { aliases: { $regex: needle, $options: "i" } },
    ];
  }

  const merchants = await MerchantModel.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();

  res.json({
    org_id: orgId.toString(),
    merchants: merchants.map(mapMerchant),
    request_id: req.requestId,
  });
};

export const upsertMerchant = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const body = req.body as any;
  const name = String(body.name || "").trim();
  if (!name) {
    throw new HttpError(400, "INVALID_NAME", "Merchant name is required");
  }
  const normalizedName = normalizeMerchantName(name);
  if (!normalizedName) {
    throw new HttpError(400, "INVALID_NAME", "Merchant name is invalid after normalization");
  }

  const categoryDefault = body.category_default ? String(body.category_default).trim() : undefined;
  const aliases = Array.isArray(body.aliases) ? body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 50) : [];
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

  const updated = await MerchantModel.findOneAndUpdate(
    { orgId, normalizedName },
    {
      $set: {
        name,
        normalizedName,
        categoryDefault,
        metadata,
      },
      ...(aliases.length
        ? {
            $addToSet: {
              aliases: { $each: aliases },
            },
          }
        : {}),
      $setOnInsert: {
        orgId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  res.status(201).json({
    org_id: orgId.toString(),
    merchant: mapMerchant(updated),
    request_id: req.requestId,
  });
};

