/**
 * @fileoverview Transactions CSV Import Controller (v1)
 *
 * Handles bulk transaction import from CSV files. Supports dry-run mode,
 * custom column mapping, optional account association, and mapping persistence.
 *
 * Routes served:
 *   POST /api/v1/integrations/transactions_csv/import - importTransactionsCsvEndpoint
 *
 * Key patterns:
 *   - Requires admin role for the organization
 *   - Dry-run mode validates and previews without persisting
 *   - Column mapping provided in request body; optionally saved to account metadata
 *   - Feature limit enforced on the number of valid rows (not total rows)
 *   - Domain event published on successful import for downstream consumers
 *   - Idempotency key derived from import_id to prevent double-counting usage
 *
 * @module controllers/v1/transactionsCsvImportController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import AccountModel from "../../models/accountModel";
import { HttpError } from "../../middleware/httpError";
import type { MutationSource } from "../../types/provenance";
import { enforceFeatureLimit, recordFeatureUsage } from "../../services/entitlements";
import { ensureProfileWithMigration, bumpTransactionMetadata, setProfileMutationSource } from "../../services/profileService";
import { publishDomainEvent } from "../../services/domainEvents";
import { importTransactionsCsv } from "../../services/transactionsCsvImport";

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

const buildMutationSource = (params: {
  requestId?: string;
  note?: string;
  actionLinkId?: string;
}): MutationSource => ({
  origin: "csv_import",
  request_id: params.requestId,
  actor_type: "user",
  action_link_id: params.actionLinkId,
  source_ref: "integration:transactions_csv",
  note: params.note,
});

export const importTransactionsCsvEndpoint = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file?.buffer || !file.originalname) {
    throw new HttpError(400, "MISSING_FILE", "Missing CSV file");
  }

  const body = req.body as any;
  const mapping = body.mapping as any;
  if (!mapping || typeof mapping !== "object") {
    throw new HttpError(400, "INVALID_MAPPING", "Missing or invalid CSV mapping");
  }

  const dryRun = Boolean(body.dry_run);
  const rememberMapping = body.remember_mapping !== false;

  const accountIdRaw = typeof body.account_id === "string" ? body.account_id.trim() : "";
  let accountId: mongoose.Types.ObjectId | undefined = undefined;
  if (accountIdRaw) {
    if (!mongoose.Types.ObjectId.isValid(accountIdRaw)) {
      throw new HttpError(400, "INVALID_ACCOUNT_ID", "Invalid account_id");
    }
    accountId = new mongoose.Types.ObjectId(accountIdRaw);
    const exists = await AccountModel.findOne({ _id: accountId, orgId }).select({ _id: 1 }).lean();
    if (!exists) {
      throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found for org");
    }
  }

  const source = buildMutationSource({
    requestId: req.requestId,
    note: file.originalname,
    actionLinkId: `csv_import:${req.requestId || Date.now()}`.slice(0, 128),
  });

  const result = await importTransactionsCsv({
    orgId,
    userId: user._id,
    fileName: file.originalname,
    buffer: file.buffer,
    mapping,
    accountId,
    requestId: req.requestId,
    dryRun,
    source,
    enforceLimit: async (validRows) => {
      await enforceFeatureLimit({
        orgId,
        userId: user._id,
        feature: "connector_sync_records",
        units: validRows,
        requestId: req.requestId,
      });
    },
  });

  if (!dryRun) {
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
    bumpTransactionMetadata(profile, { deltaCount: result.inserted, at: new Date() });
    setProfileMutationSource(profile, source);
    await profile.save();

    if (result.inserted > 0) {
      await publishDomainEvent({
        orgId,
        userId: user._id,
        eventType: "TransactionImported",
        aggregateType: "csv_import",
        aggregateId: result.import_id || `csv_import:${Date.now()}`,
        actionLinkId: source.action_link_id,
        requestId: req.requestId,
        payload: {
          source,
          import_id: result.import_id,
          file_name: result.file_name,
          parsed_rows: result.parsed_rows,
          valid_rows: result.valid_rows,
          inserted: result.inserted,
          duplicates: result.duplicates,
          account_id: accountId ? accountId.toString() : null,
        },
      }).catch(() => null);
    }

    await recordFeatureUsage({
      orgId,
      userId: user._id,
      feature: "connector_sync_records",
      units: result.inserted,
      requestId: req.requestId,
      idempotencyKey: `csv_import:${result.import_id || req.requestId || ""}`.slice(0, 128),
      context: {
        endpoint: "integrations/transactions_csv/import",
        file_name: result.file_name,
        parsed_rows: result.parsed_rows,
        valid_rows: result.valid_rows,
        duplicates: result.duplicates,
      },
    }).catch(() => null);
  }

  if (accountId && rememberMapping) {
    const account = await AccountModel.findOne({ _id: accountId, orgId });
    if (account) {
      const nextMetadata =
        account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
          ? { ...(account.metadata as Record<string, unknown>) }
          : {};
      const importPreferences =
        nextMetadata.import_preferences && typeof nextMetadata.import_preferences === "object" && !Array.isArray(nextMetadata.import_preferences)
          ? { ...(nextMetadata.import_preferences as Record<string, unknown>) }
          : {};

      importPreferences.transactions_csv = {
        last_mapping: mapping,
        last_file_name: file.originalname,
        updated_at: new Date().toISOString(),
      };
      nextMetadata.import_preferences = importPreferences;
      account.metadata = nextMetadata;
      await account.save();
    }
  }

  res.status(dryRun ? 200 : 201).json({
    org_id: orgId.toString(),
    ...result,
    request_id: req.requestId,
  });
};
