import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import AccountModel from "../../models/accountModel";
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

const mapAccount = (account: any) => ({
  id: String(account._id),
  name: String(account.name || ""),
  institution: account.institution ? String(account.institution) : null,
  type: String(account.type || "checking"),
  currency: String(account.currency || "USD"),
  mask: account.mask ? String(account.mask) : null,
  status: String(account.status || "active"),
  metadata: account.metadata || {},
  created_at: account.createdAt || null,
  updated_at: account.updatedAt || null,
});

export const listAccounts = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const accounts = await AccountModel.find({ orgId }).sort({ updatedAt: -1 }).lean();

  res.json({
    org_id: orgId.toString(),
    accounts: accounts.map(mapAccount),
    request_id: req.requestId,
  });
};

export const createAccount = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const body = req.body as any;
  const created = await AccountModel.create({
    orgId,
    name: String(body.name),
    institution: body.institution ? String(body.institution) : undefined,
    type: String(body.type || "checking"),
    currency: String(body.currency || "USD"),
    mask: body.mask ? String(body.mask) : undefined,
    status: "active",
    createdByUserId: user._id,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });

  res.status(201).json({
    org_id: orgId.toString(),
    account: mapAccount(created.toObject()),
    request_id: req.requestId,
  });
};

export const updateAccount = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const accountIdRaw = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(accountIdRaw)) {
    throw new HttpError(400, "INVALID_ACCOUNT_ID", "Invalid account id");
  }
  const accountId = new mongoose.Types.ObjectId(accountIdRaw);

  const body = req.body as any;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.institution !== undefined) update.institution = body.institution ? String(body.institution) : undefined;
  if (body.type !== undefined) update.type = String(body.type);
  if (body.currency !== undefined) update.currency = String(body.currency);
  if (body.mask !== undefined) update.mask = body.mask ? String(body.mask) : undefined;
  if (body.status !== undefined) update.status = String(body.status);
  if (body.metadata !== undefined && body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    update.metadata = body.metadata;
  }

  const updated = await AccountModel.findOneAndUpdate({ _id: accountId, orgId }, { $set: update }, { new: true }).lean();
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Account not found");
  }

  res.json({
    org_id: orgId.toString(),
    account: mapAccount(updated),
    request_id: req.requestId,
  });
};
