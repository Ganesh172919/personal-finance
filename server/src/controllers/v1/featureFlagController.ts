/**
 * @fileoverview Feature Flag Controller (v1)
 *
 * Organization-level feature flags with variant and rollout percentage support.
 * Admins can create, update, and delete flags per organization.
 *
 * Routes served:
 *   GET    /api/v1/feature-flags          - listFeatureFlags (admin)
 *   PUT    /api/v1/feature-flags/:key     - upsertFeatureFlag (admin)
 *   DELETE /api/v1/feature-flags/:key     - deleteFeatureFlag (admin)
 *
 * Key patterns:
 *   - All endpoints require admin role
 *   - Flags are keyed by lowercase string within an org
 *   - upsert uses findOneAndUpdate with upsert:true (create or update in one call)
 *   - Rollout percent clamped to 0-100
 *   - Variant field unset when not provided (via $unset)
 *
 * @module controllers/v1/featureFlagController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import FeatureFlagModel from "../../models/featureFlagModel";
import { HttpError } from "../../middleware/httpError";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

// Escapes regular expression special characters in user-provided query patterns.
// Prevents regex injection attacks when compiling dynamic feature flag search filters.
// Returns a sanitized string safe for direct inclusion in MongoDB regex patterns.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Validates administrative privileges for tenant feature flag configuration.
// Confirms presence of organization context and verifies caller administrative rank.
// Aborts request handling with an unauthorized or access denied exception on failure.
const requireOrgAdmin = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  if (roleRank[req.org.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

// Queries all tenant-scoped feature flags matching optional key prefix filters.
// Extracts rollout percentages, enablement statuses, variants, and metadata payloads.
// Returns an array of feature flag configurations to guide client-side toggling.
export const listFeatureFlags = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const query = req.query as { key_prefix?: string; enabled?: boolean };

  const filters: Record<string, unknown> = { orgId };
  if (typeof query.key_prefix === "string" && query.key_prefix.trim().length > 0) {
    filters.key = { $regex: `^${escapeRegExp(query.key_prefix.trim())}` };
  }
  if (typeof query.enabled === "boolean") {
    filters.enabled = query.enabled;
  }

  const flags = await FeatureFlagModel.find(filters)
    .sort({ key: 1 })
    .select({ key: 1, enabled: 1, variant: 1, rolloutPercent: 1, metadata: 1, updatedAt: 1 })
    .lean();

  return res.json({
    org_id: orgId.toString(),
    flags: flags.map((flag: any) => ({
      key: String(flag.key),
      enabled: Boolean(flag.enabled),
      variant: flag.variant ? String(flag.variant) : null,
      rollout_percent: Number(flag.rolloutPercent ?? 100),
      metadata: flag.metadata || {},
      updated_at: flag.updatedAt || null,
    })),
    request_id: req.requestId,
  });
};

// Idempotently creates or mutates a tenant-scoped feature flag configuration.
// Updates rollout percentages, variant strings, metadata objects, and author stamps.
// Persists the feature flag definition and responds with the updated flag entity.
export const upsertFeatureFlag = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  const key = String((req.params as any).key || "").trim().toLowerCase();
  const body = req.body as {
    enabled: boolean;
    variant?: string;
    rollout_percent?: number;
    metadata?: Record<string, unknown>;
  };

  const setPayload: Record<string, unknown> = {
    enabled: Boolean(body.enabled),
    updatedByUserId: user?._id,
  };
  if (typeof body.variant === "string" && body.variant.trim().length > 0) {
    setPayload.variant = body.variant.trim();
  }
  if (typeof body.rollout_percent === "number") {
    setPayload.rolloutPercent = Math.max(0, Math.min(100, Math.floor(body.rollout_percent)));
  }
  if (body.metadata && typeof body.metadata === "object") {
    setPayload.metadata = body.metadata;
  }

  const unsetPayload: Record<string, 1> = {};
  if (!body.variant) {
    unsetPayload.variant = 1;
  }

  const updatePayload: Record<string, unknown> = { $set: setPayload };
  if (Object.keys(unsetPayload).length > 0) {
    updatePayload.$unset = unsetPayload;
  }

  const flag = await FeatureFlagModel.findOneAndUpdate(
    { orgId, key },
    updatePayload,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .select({ key: 1, enabled: 1, variant: 1, rolloutPercent: 1, metadata: 1, updatedAt: 1 })
    .lean();

  return res.status(201).json({
    org_id: orgId.toString(),
    flag: {
      key: String((flag as any).key),
      enabled: Boolean((flag as any).enabled),
      variant: (flag as any).variant ? String((flag as any).variant) : null,
      rollout_percent: Number((flag as any).rolloutPercent ?? 100),
      metadata: (flag as any).metadata || {},
      updated_at: (flag as any).updatedAt || null,
    },
    request_id: req.requestId,
  });
};

// Permanently deletes an organization-specific feature flag record by key name.
// Asserts administrative rights and targets the specific organization tenant scope.
// Confirms whether the record was deleted and returns request correlation metrics.
export const deleteFeatureFlag = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const key = String((req.params as any).key || "").trim().toLowerCase();

  const result = await FeatureFlagModel.deleteOne({ orgId, key });
  return res.json({
    org_id: orgId.toString(),
    key,
    deleted: result.deletedCount > 0,
    request_id: req.requestId,
  });
};
