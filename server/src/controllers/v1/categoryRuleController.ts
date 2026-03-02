import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  listCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "../../services/categoryRuleService";
import { HttpError } from "../../middleware/httpError";

function getOrgAndUser(req: Request) {
  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const userId = new mongoose.Types.ObjectId(String(user._id));
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : userId;
  return { orgId, userId };
}

export async function listRules(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const rules = await listCategoryRules(orgId, userId);
  res.json({ rules, total: rules.length, request_id: req.requestId });
}

export async function createRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const rule = await createCategoryRule(orgId, userId, req.body);
  res.status(201).json({ rule, request_id: req.requestId });
}

export async function updateRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const ruleId = new mongoose.Types.ObjectId(String(req.params.id));
  const updated = await updateCategoryRule(ruleId, orgId, userId, req.body);
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Category rule not found");
  }
  res.json({ rule: updated, request_id: req.requestId });
}

export async function deleteRule(req: Request, res: Response) {
  const { orgId, userId } = getOrgAndUser(req);
  const ruleId = new mongoose.Types.ObjectId(String(req.params.id));
  const result = await deleteCategoryRule(ruleId, orgId, userId);
  if (result.deletedCount === 0) {
    throw new HttpError(404, "NOT_FOUND", "Category rule not found");
  }
  res.json({ deleted: true, request_id: req.requestId });
}
