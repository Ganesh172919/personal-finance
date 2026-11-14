/**
 * @fileoverview Category Rule Controller (v1)
 *
 * Manages user-defined rules that automatically categorize transactions
 * based on patterns (e.g., "Starbucks" -> "Food & Drink").
 *
 * Routes served:
 *   GET    /api/v1/category-rules     - listRules
 *   POST   /api/v1/category-rules     - createRule
 *   PUT    /api/v1/category-rules/:id - updateRule
 *   DELETE /api/v1/category-rules/:id - deleteRule
 *
 * Key patterns:
 *   - Thin controller: delegates all logic to categoryRuleService
 *   - Org ID falls back to user ID when org context is missing
 *   - Rules are user-scoped within an organization
 *
 * @module controllers/v1/categoryRuleController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  listCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "../../services/categoryRuleService";
import { HttpError } from "../../middleware/httpError";

// Extracts user and organization ObjectIds from incoming request context headers.
// Falls back gracefully to personal user scoping when organization context is omitted.
// Returns an object containing normalized organization and user database identifiers.
function getOrgAndUser(req: Request) {
  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const userId = new mongoose.Types.ObjectId(String(user._id));
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : userId;
  return { orgId, userId };
}

// Retrieves all transaction categorization automation rules configured by the user.
// Queries the category rule service scoped to the caller organization and user ID.
// Responds with the active rule array and overall rule count for the client.
export async function listRules(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const rules = await listCategoryRules(orgId, userId);
  res.json({ rules, total: rules.length, request_id: req.requestId });
}

// Persists a new transaction categorization rule based on merchant or description match.
// Delegates validation and rule persistence to the backing category rule service.
// Returns the newly established rule entity accompanied by request tracking metadata.
export async function createRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const rule = await createCategoryRule(orgId, userId, req.body);
  res.status(201).json({ rule, request_id: req.requestId });
}

// Updates match criteria, destination categories, or priority for an existing rule.
// Enforces tenant and author ownership verification before applying field updates.
// Commits the modified category rule document or throws an HTTP 404 error if missing.
export async function updateRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const ruleId = new mongoose.Types.ObjectId(String(req.params.id));
  const updated = await updateCategoryRule(ruleId, orgId, userId, req.body);
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Category rule not found");
  }
  res.json({ rule: updated, request_id: req.requestId });
}

// Permanently deletes an automated transaction categorization rule by identifier.
// Verifies caller ownership and tenant isolation constraints prior to deletion.
// Confirms successful deletion or returns a not found HTTP error if unmatched.
export async function deleteRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const ruleId = new mongoose.Types.ObjectId(String(req.params.id));
  const result = await deleteCategoryRule(ruleId, orgId, userId);
  if (result.deletedCount === 0) {
    throw new HttpError(404, "NOT_FOUND", "Category rule not found");
  }
  res.json({ deleted: true, request_id: req.requestId });
}
