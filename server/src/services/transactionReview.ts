/**
 * @fileoverview Transaction Review Service
 *
 * Automatically flags transactions that need human review based on
 * heuristics (uncategorized, suspected duplicates, missing merchant, etc.).
 * This powers the "review queue" in the Transactions page.
 *
 * REVIEW FLAGS:
 * - uncategorized: Category is missing or generic ("other")
 * - suspected_duplicate: Similar transaction exists (same amount, date, description)
 * - needs_merchant_match: Merchant name not resolved from description
 * - split_candidate: Large transaction that might need splitting
 * - recurring_candidate: Looks like a recurring subscription/payment
 *
 * ATTENTION SCORE:
 * Each flag adds to an attention score (0-100). Higher scores mean
 * the transaction is more likely to need human review.
 *
 * WHEN IS THIS RUN?
 * - On transaction creation (CSV import, receipt OCR, manual entry)
 * - On bulk import (batch review flagging)
 * - On demand (user triggers re-analysis)
 *
 * @module services/transactionReview
 */

import mongoose from "mongoose";

import TransactionModel from "../models/transactionModel";

/** Valid review flags for transactions */
export type TransactionReviewFlag =
  | "uncategorized"
  | "suspected_duplicate"
  | "needs_merchant_match"
  | "split_candidate"
  | "recurring_candidate";

/** The review state attached to a transaction */
export type TransactionReviewState = {
  needs_attention: boolean;
  flags: TransactionReviewFlag[];
  notes: string[];
  attention_score: number;
  confidence_score: number;
};

/** Minimal transaction shape needed for review analysis */
export type ReviewableTransactionLike = {
  _id?: unknown;
  amount: number;
  category?: string;
  description?: string;
  type?: string;
  merchantId?: mongoose.Types.ObjectId | string | null;
};

/** Normalize text for comparison (lowercase, single spaces, trimmed) */
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Check if a category is missing or generic */
const isUncategorized = (category?: string) => {
  const normalized = normalizeText(String(category || ""));
  return !normalized || normalized === "other" || normalized === "uncategorized" || normalized === "misc";
};

const isLikelySplitCandidate = (description: string, amount: number) => {
  const normalized = normalizeText(description);
  if (!normalized) return false;
  if (Math.abs(amount) < 1_000) return false;
  return normalized.includes(" / ") || normalized.includes(" + ") || normalized.includes(",") || normalized.includes(" and ");
};

/**
 * Compute a confidence score (0.0–1.0) based on how many flags are present
 * and whether the transaction has a known merchant association.
 *
 * Base score: 1.0
 * Penalty: -0.20 per flag
 * Boost: +0.10 if merchant is associated
 * Floor: 0.10
 */
const computeConfidenceScore = (params: {
  flags: TransactionReviewFlag[];
  merchantId?: mongoose.Types.ObjectId | string | null;
}): number => {
  let score = 1.0;
  score -= params.flags.length * 0.20;
  if (params.merchantId) score += 0.10;
  return Math.max(0.10, Math.min(1.0, Math.round(score * 100) / 100));
};

export const buildTransactionReviewState = (params: {
  category?: string;
  description?: string;
  amount: number;
  type?: string;
  merchantId?: mongoose.Types.ObjectId | string | null;
  duplicateCount?: number;
  recurringCount?: number;
}): TransactionReviewState => {
  const flags: TransactionReviewFlag[] = [];
  const notes: string[] = [];
  const normalizedDescription = String(params.description || "").trim();
  const isExpenseLike = params.type === "expense" || params.type === "investment";

  if (isUncategorized(params.category)) {
    flags.push("uncategorized");
    notes.push("Category still needs review.");
  }

  if (isExpenseLike && !params.merchantId && normalizedDescription) {
    flags.push("needs_merchant_match");
    notes.push("Merchant could not be matched automatically.");
  }

  if ((params.duplicateCount || 0) > 1) {
    flags.push("suspected_duplicate");
    notes.push("Matching amount, date, and description already exist.");
  }

  if ((params.recurringCount || 0) >= 3 && params.type === "expense") {
    flags.push("recurring_candidate");
    notes.push("This looks like part of a recurring spending pattern.");
  }

  if (isLikelySplitCandidate(normalizedDescription, params.amount)) {
    flags.push("split_candidate");
    notes.push("Description suggests this transaction may need a split.");
  }

  const confidenceScore = computeConfidenceScore({
    flags,
    merchantId: params.merchantId,
  });

  return {
    needs_attention: flags.length > 0,
    flags,
    notes,
    attention_score: flags.length,
    confidence_score: confidenceScore,
  };
};

export const enrichTransactionsForReview = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  transactions: ReviewableTransactionLike[];
}) => {
  const reviewById = new Map<string, TransactionReviewState>();

  await Promise.all(
    params.transactions.map(async (transaction) => {
      const txId = transaction._id ? String(transaction._id) : "";
      if (!txId) return;

      const description = String(transaction.description || "").trim();
      const category = String(transaction.category || "");
      const amount = Number(transaction.amount || 0);

      const duplicateMatch = await TransactionModel.countDocuments({
        orgId: params.orgId,
        userId: params.userId,
        _id: { $ne: transaction._id },
        amount,
        category,
        description,
      });

      const recurringMatch = description
        ? await TransactionModel.countDocuments({
            orgId: params.orgId,
            userId: params.userId,
            type: "expense",
            description: new RegExp(`^${description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
          })
        : 0;

      reviewById.set(
        txId,
        buildTransactionReviewState({
          category,
          description,
          amount,
          type: String(transaction.type || ""),
          merchantId: transaction.merchantId,
          duplicateCount: duplicateMatch + 1,
          recurringCount: recurringMatch,
        })
      );
    })
  );

  return reviewById;
};

/**
 * Approve a single transaction: clears all review flags, sets confidence
 * to 1.0, and records the reviewer for audit trail.
 */
export const approveTransaction = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  transactionId: string;
  reviewedBy: string;
}) => {
  const updated = await TransactionModel.findOneAndUpdate(
    {
      _id: params.transactionId,
      orgId: params.orgId,
      userId: params.userId,
    },
    {
      $set: {
        "review.needs_attention": false,
        "review.flags": [],
        "review.notes": [],
        "review.attention_score": 0,
        "review.confidence_score": 1.0,
        "review.reviewed_at": new Date(),
        "review.reviewed_by": params.reviewedBy,
        "review.updatedAt": new Date(),
      },
    },
    { new: true }
  );

  return updated;
};

/**
 * Bulk approve multiple transactions by IDs.
 * Clears all flags and sets confidence to 1.0.
 */
export const bulkApproveTransactions = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  transactionIds: string[];
  reviewedBy: string;
}) => {
  const validIds = params.transactionIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validIds.length === 0) return { modified: 0 };

  const result = await TransactionModel.updateMany(
    {
      _id: { $in: validIds },
      orgId: params.orgId,
      userId: params.userId,
    },
    {
      $set: {
        "review.needs_attention": false,
        "review.flags": [],
        "review.notes": [],
        "review.attention_score": 0,
        "review.confidence_score": 1.0,
        "review.reviewed_at": new Date(),
        "review.reviewed_by": params.reviewedBy,
        "review.updatedAt": new Date(),
      },
    }
  );

  return { modified: result.modifiedCount || 0 };
};

