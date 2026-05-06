/**
 * @fileoverview Receipt Controller
 *
 * Handles receipt image upload, OCR parsing, and confirmation workflow.
 * Users upload a receipt image, the OCR service extracts structured data,
 * and the user confirms/corrects the extracted fields before a transaction is created.
 *
 * Routes served:
 *   POST   /api/receipts/parse          - parseReceipt (upload + OCR)
 *   POST   /api/receipts/:id/confirm    - confirmReceipt (create transaction)
 *   GET    /api/receipts                - listReceipts
 *   GET    /api/receipts/:id            - getReceiptById
 *   DELETE /api/receipts/:id            - deleteReceipt
 *
 * Key patterns:
 *   - Feature-gated: endpoints return 404 when RECEIPTS_OCR_ENABLED is false
 *   - OCR quota enforced via entitlement system before processing
 *   - Images stored in GridFS; receipt metadata in ReceiptModel
 *   - confirmReceipt creates an expense transaction and publishes domain events
 *   - Cannot delete a receipt that has already been confirmed (409 conflict)
 *   - Currency hint resolved from org settings if not provided by user
 *
 * @module controllers/receiptController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import ReceiptModel, { type ReceiptExtracted } from "../models/receiptModel";
import OrganizationModel from "../models/organizationModel";
import TransactionModel from "../models/transactionModel";
import { IUserDocument } from "../models/userModel";
import { processAiCoreReceiptOcr } from "../services/aiCoreClient";
import { deleteGridFsFile, uploadBufferToGridFs } from "../services/gridfs";
import {
  bumpTransactionMetadata,
  ensureProfileWithMigration,
  setProfileMutationSource,
} from "../services/profileService";
import { publishDomainEvent } from "../services/domainEvents";
import { recordOcrParse } from "../observability/metrics";
import { enforceFeatureLimit, recordFeatureUsage } from "../services/entitlements";
import { logger } from "../config/logger";

const mapTransactionRecord = (transaction: {
  _id: unknown;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: string;
  source?: unknown;
}) => ({
  id: String(transaction._id),
  amount: transaction.amount,
  category: transaction.category,
  description: transaction.description,
  date: transaction.date,
  type: transaction.type,
  source: transaction.source || undefined,
});

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const resolveOrgCurrency = async (orgId: mongoose.Types.ObjectId) => {
  const org = await OrganizationModel.findById(orgId).select({ currency: 1 }).lean();
  const code = String((org as any)?.currency || "").trim().toUpperCase();
  if (code.length === 3 && /^[A-Z]{3}$/.test(code)) {
    return code;
  }
  return "USD";
};

export const parseReceipt = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.RECEIPTS_OCR_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Receipt OCR is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "ocr_quota",
    units: 1,
    requestId: req.requestId,
  });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file?.buffer || !file.originalname) {
    throw new HttpError(400, "MISSING_FILE", "Missing receipt image file");
  }

  const lang = typeof req.body?.lang === "string" ? req.body.lang.trim() : "en";
  const currencyHint =
    typeof req.body?.currencyHint === "string" && req.body.currencyHint.trim()
      ? req.body.currencyHint.trim().toUpperCase()
      : await resolveOrgCurrency(orgId);

  const fileId = await uploadBufferToGridFs({
    userId: user._id.toString(),
    purpose: "receipt",
    buffer: file.buffer,
    filename: file.originalname,
    contentType: file.mimetype || "application/octet-stream",
  });

  const ocr = await processAiCoreReceiptOcr(
    {
      image: file.buffer,
      contentType: file.mimetype || "application/octet-stream",
      lang,
      currencyHint,
    },
    req.requestId,
    { userId: user._id.toString() }
  );
  recordOcrParse({ success: Boolean(ocr.success) });

  const extracted: ReceiptExtracted = ocr.extracted || {};

  const receipt = await ReceiptModel.create({
    orgId,
    userId: user._id,
    fileId,
    status: "parsed",
    extracted,
    confidence: ocr.confidence || {},
    warnings: Array.isArray(ocr.warnings) ? ocr.warnings : [],
    categorySuggestion: extracted.category_suggestion || ocr.extracted?.category_suggestion,
  });

  await recordFeatureUsage({
    orgId,
    userId: user._id,
    feature: "ocr_quota",
    units: 1,
    requestId: req.requestId,
    context: {
      endpoint: "receipts/parse",
      filename: file.originalname,
      content_type: file.mimetype || "application/octet-stream",
    },
  });

  res.json({
    receipt_id: receipt._id.toString(),
    file_id: fileId.toString(),
    extracted,
    confidence: ocr.confidence || {},
    warnings: Array.isArray(ocr.warnings) ? ocr.warnings : [],
    request_id: ocr.request_id || req.requestId,
    success: Boolean(ocr.success),
  });
};

export const confirmReceipt = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.RECEIPTS_OCR_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Receipt OCR is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const receiptId = String((req as any).params?.id || "");

  const receipt = await ReceiptModel.findOne({ _id: receiptId, orgId, userId: user._id });
  if (!receipt) {
    throw new HttpError(404, "NOT_FOUND", "Receipt not found");
  }

  const { vendor, date, total, tax, currency, category, description, items } = req.body as any;

  const profile = await ensureProfileWithMigration({ orgId, userId: user._id });
  const source = {
    origin: "receipt_ocr" as const,
    request_id: req.requestId,
    receipt_id: receiptId,
    actor_type: "user" as const,
    source_ref: `receipt:${receiptId}`,
  };

  const created = await TransactionModel.create({
    orgId,
    userId: user._id,
    amount: -Math.abs(Number(total)),
    category: String(category),
    description: String(description || vendor || "Receipt expense").slice(0, 250),
    type: "expense",
    date: new Date(String(date)),
    source,
  });

  bumpTransactionMetadata(profile, { deltaCount: 1 });
  setProfileMutationSource(profile, source);
  await profile.save();

  const corrections: ReceiptExtracted = {
    vendor: String(vendor),
    date: String(date),
    total: Number(total),
    tax: tax === undefined ? undefined : Number(tax),
    currency: currency ? String(currency) : undefined,
    items: Array.isArray(items) ? items : undefined,
  };

  receipt.status = "confirmed";
  receipt.corrections = corrections as any;
  receipt.transactionId = created._id as any;
  await receipt.save();

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: "TransactionCreated",
    aggregateType: "transaction",
    aggregateId: created._id.toString(),
    requestId: req.requestId,
    payload: {
      source,
      transaction_type: created.type,
      category: created.category,
      amount: created.amount,
      receipt_id: receiptId,
    },
  }).catch(() => null);

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: "ReceiptConfirmed",
    aggregateType: "receipt",
    aggregateId: receiptId,
    requestId: req.requestId,
    payload: {
      receipt_id: receiptId,
      transaction_id: created._id.toString(),
      source,
    },
  }).catch(() => null);

  res.json({
    source,
    transaction: mapTransactionRecord(created),
    receipt: {
      id: receipt._id.toString(),
      status: receipt.status,
      extracted: receipt.extracted,
      confidence: receipt.confidence,
      warnings: receipt.warnings,
      corrections: receipt.corrections,
      transactionId: receipt.transactionId?.toString(),
      fileId: receipt.fileId.toString(),
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    },
    request_id: req.requestId,
  });
};

export const listReceipts = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.RECEIPTS_OCR_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Receipt OCR is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const page = Math.max(1, Number((req as any).query?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number((req as any).query?.limit) || 20));
  const skip = (page - 1) * limit;

  const [total, docs] = await Promise.all([
    ReceiptModel.countDocuments({ orgId, userId: user._id }),
    ReceiptModel.find({ orgId, userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    receipts: docs.map(doc => ({
      id: String((doc as any)._id),
      status: (doc as any).status,
      extracted: (doc as any).extracted,
      corrections: (doc as any).corrections,
      transactionId: (doc as any).transactionId ? String((doc as any).transactionId) : undefined,
      fileId: (doc as any).fileId ? String((doc as any).fileId) : undefined,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
};

export const getReceiptById = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.RECEIPTS_OCR_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Receipt OCR is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const receiptId = String((req as any).params?.id || "");

  const receipt = await ReceiptModel.findOne({ _id: receiptId, orgId, userId: user._id }).lean();
  if (!receipt) {
    throw new HttpError(404, "NOT_FOUND", "Receipt not found");
  }

  res.json({
    receipt: {
      id: String((receipt as any)._id),
      status: (receipt as any).status,
      extracted: (receipt as any).extracted,
      confidence: (receipt as any).confidence,
      warnings: (receipt as any).warnings,
      corrections: (receipt as any).corrections,
      transactionId: (receipt as any).transactionId ? String((receipt as any).transactionId) : undefined,
      fileId: (receipt as any).fileId ? String((receipt as any).fileId) : undefined,
      createdAt: (receipt as any).createdAt,
      updatedAt: (receipt as any).updatedAt,
    },
    request_id: req.requestId,
  });
};

export const deleteReceipt = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.RECEIPTS_OCR_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Receipt OCR is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const receiptId = String((req as any).params?.id || "");

  const receipt = await ReceiptModel.findOne({ _id: receiptId, orgId, userId: user._id });
  if (!receipt) {
    throw new HttpError(404, "NOT_FOUND", "Receipt not found");
  }

  if (receipt.status === "confirmed" || receipt.transactionId) {
    throw new HttpError(409, "RECEIPT_CONFIRMED", "Receipt already confirmed");
  }

  const fileId = receipt.fileId?.toString();

  await ReceiptModel.deleteOne({ _id: receiptId, orgId, userId: user._id });

  if (fileId) {
    await deleteGridFsFile(fileId).catch((error) => {
      logger.warn(`[requestId=${req.requestId}] Failed to delete GridFS file ${fileId}:`, error);
    });
  }

  res.json({ receipt_id: receiptId, request_id: req.requestId });
};
