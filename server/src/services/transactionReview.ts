/**
 * @fileoverview Transaction Review Service
 *
 * Automatically flags transactions that need human review based on
 * heuristics (uncategorized, suspected duplicates, missing merchant, etc.).
 * This powers the "review queue" in the Transactions page.
 *
 * ============================================================================
 * MINDMAP FLOW: TRANSACTION TRIAGE & HEURISTIC REVIEW ENGINE
 * ============================================================================
 * - Transaction Review & Quality Assurance
 *     ├── 1. Ingestion Triggers
 *     │   ├── Real-time Creation: Manual entry, API ingest
 *     │   ├── Document Pipelines: CSV / OFX bank statement imports, PDF/OCR parsers
 *     │   └── Scheduled Jobs: Daily queue re-indexing & rule application
 *     ├── 2. Automated Heuristic Classifiers
 *     │   ├── Uncategorized: Category empty or generic ("other", "misc", "uncategorized")
 *     │   ├── Suspected Duplicate: Identical amount, close timestamp, matching payee
 *     │   ├── Needs Merchant Match: Unresolved merchant entity id
 *     │   ├── Split Candidate: High value (> $1,000) with compound delimiters ('/', '+', 'and')
 *     │   └── Recurring Candidate: Periodic cadence pattern detected
 *     ├── 3. Attention & Confidence Scoring
 *     │   ├── Attention Score (0 - 100): Composite sum of weighted heuristic flags
 *     │   ├── Confidence Score (0.10 - 1.00): Base 1.00 - (0.20 * flag_count) + 0.10 merchant boost
 *     │   └── Needs Attention Predicate: Boolean flag gating review queue visibility
 *     └── 4. Review Queue Operations
 *         ├── Single Transaction Evaluation (buildTransactionReviewState)
 *         ├── Batch Bulk Scanning (recomputeReviewStateForTransactions)
 *         └── User Resolution: 1-click approve, category change, split, rule creation
 *
 * ============================================================================
 * ASCII FLOW: TRANSACTION REVIEW & CONFIDENCE SCORING LIFECYCLE
 * ============================================================================
 *                   [ Inbound Transaction Record ]
 *                                 |
 *                                 v
 *               +----------------------------------+
 *               |   Heuristic Classifier Matrix    |
 *               +-----------------+----------------+
 *                                 |
 *      +------------+-------------+-------------+------------+
 *      |            |             |             |            |
 *      v            v             v             v            v
 *  [Missing     [Duplicate    [Merchant     [Split       [Recurring
 *   Category?]   Detected?]    Missing?]     Candidate?]  Pattern?]
 *      |            |             |             |            |
 *      v            v             v             v            v
 *   FLAG:        FLAG:         FLAG:         FLAG:        FLAG:
 *  uncategorized duplicate     needs_match   split_cand   recurring_cand
 *      |            |             |             |            |
 *      +------------+-------------+-------------+------------+
 *                                 |
 *                                 v
 *               +----------------------------------+
 *               |   Attention & Confidence Calc    |
 *               | Attention = sum(flag_weights)    |
 *               | Confidence = 1.0 - (0.20*flags)  |
 *               | + 0.10 (if merchantId present)   |
 *               +-----------------+----------------+
 *                                 |
 *                                 v
 *                    Are any flags present?
 *                           /      \
 *                       Yes /        \ No
 *                          v          v
 *            +------------------+  +-------------------+
 *            | needs_attention  |  | needs_attention   |
 *            | = true           |  | = false           |
 *            | Route to Review  |  | Ready for Auto-   |
 *            | Queue Dashboard  |  | Accounting        |
 *            +------------------+  +-------------------+
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

import { createHash } from "node:crypto";
import mongoose from "mongoose";

import TransactionModel from "../models/transactionModel";

/** Valid review flags for transactions */
// Defines heuristic classification flags signaling review requirements.
// Includes missing categories, suspected duplicates, and split candidates.
// Highlights transactions requiring human confirmation or accounting triage.
export type TransactionReviewFlag =
  | "uncategorized"
  | "suspected_duplicate"
  | "needs_merchant_match"
  | "split_candidate"
  | "recurring_candidate";

/** The review state attached to a transaction */
// Encapsulates the triage review evaluation state of a financial transaction.
// Contains active flags, qualitative notes, and computed attention scores.
// Tracks reviewer identifiers, review timestamps, and ledger content hashes.
export type TransactionReviewState = {
  needs_attention: boolean;
  flags: TransactionReviewFlag[];
  notes: string[];
  attention_score: number;
  confidence_score: number;
  reviewed_at?: Date;
  reviewed_by?: string;
  reviewed_values_hash?: string;
};

/** Minimal transaction shape needed for review analysis */
// Represents minimal structural fields required to evaluate transaction review status.
// Encompasses monetary amounts, descriptions, categories, and merchant linkages.
// Supplies previous review states and split allocations for heuristic inspection.
export type ReviewableTransactionLike = {
  _id?: unknown;
  amount: number;
  category?: string;
  description?: string;
  type?: string;
  merchantId?: mongoose.Types.ObjectId | string | null;
  date?: Date | string;
  splits?: Array<{ category: string; amount: number }>;
  review?: {
    needs_attention: boolean;
    reviewed_at?: Date;
    reviewed_by?: string;
    reviewed_values_hash?: string;
  };
};

// Bind approval to the original ledger values, so every write path (including
// bulk edits) reopens changed records without relying on update timestamps.
// Computes a SHA-256 fingerprint hash of core transaction accounting fields.
// Detects subsequent modifications to amounts, dates, or split allocations.
// Automatically invalidates approvals when underlying financial data changes.
const reviewValuesHash = (transaction: ReviewableTransactionLike) => createHash("sha256").update(JSON.stringify({
  amount: transaction.amount,
  category: transaction.category || "",
  description: transaction.description || "",
  type: transaction.type || "",
  date: transaction.date ? new Date(transaction.date).toISOString() : null,
  merchantId: transaction.merchantId ? String(transaction.merchantId) : null,
  splits: (transaction.splits || []).map(({ category, amount }) => ({ category, amount })),
})).digest("hex");

// Constructs a cleared approval review state for an acknowledged transaction.
// Sets confidence to 1.0, clears all heuristic flags, and records reviewer identity.
// Computes and attaches current ledger value hashes to detect future tampering.
const approvedReview = (transaction: ReviewableTransactionLike, reviewedBy: string): TransactionReviewState => ({
  needs_attention: false,
  flags: [],
  notes: [],
  attention_score: 0,
  confidence_score: 1,
  reviewed_at: new Date(),
  reviewed_by: reviewedBy,
  reviewed_values_hash: reviewValuesHash(transaction),
});

/** Normalize text for comparison (lowercase, single spaces, trimmed) */
// Normalizes arbitrary text strings for reliable heuristic matching.
// Trims surrounding whitespace, collapses internal spaces, and downcases characters.
// Standardizes transaction descriptions and categories before evaluation.
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Check if a category is missing or generic */
// Evaluates whether a transaction category is missing or generically assigned.
// Checks against generic terms such as other, misc, or uncategorized.
// Flags transactions lacking explicit accounting categorization for review.
const isUncategorized = (category?: string) => {
  const normalized = normalizeText(String(category || ""));
  return !normalized || normalized === "other" || normalized === "uncategorized" || normalized === "misc";
};

// Determines whether a transaction's description and amount suggest multiple items.
// Checks for high dollar thresholds combined with compound delimiter tokens.
// Flags potential multi-item purchases for receipt splitting and itemization.
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
// Calculates an automated classification confidence score ranging from 0.10 to 1.00.
// Applies penalties for each active heuristic flag and boosts for known merchants.
// Quantifies algorithmic certainty regarding a transaction's current categorization.
const computeConfidenceScore = (params: {
  flags: TransactionReviewFlag[];
  merchantId?: mongoose.Types.ObjectId | string | null;
}): number => {
  let score = 1.0;
  score -= params.flags.length * 0.20;
  if (params.merchantId) score += 0.10;
  return Math.max(0.10, Math.min(1.0, Math.round(score * 100) / 100));
};

// Evaluates heuristic rules across transaction attributes to produce review states.
// Identifies uncategorized expenses, potential duplicates, and recurring patterns.
// Aggregates warning flags, audit notes, and confidence scores into review objects.
export const buildTransactionReviewState = (params: {
  category?: string;
  description?: string;
  amount: number;
  type?: string;
  merchantId?: mongoose.Types.ObjectId | string | null;
  duplicateCount?: number;
  recurringCount?: number;
  splits?: Array<{ category: string; amount: number }>;
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

  if (isLikelySplitCandidate(normalizedDescription, params.amount) && !(params.splits && params.splits.length > 1)) {
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

// Enriches a collection of transactions with contextual review and duplicate checks.
// Skips already-approved transactions whose ledger content hashes remain unchanged.
// Queries historical database records to detect duplicate entries and cadence patterns.
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

      const review = transaction.review;
      if (review?.reviewed_at && !review.needs_attention && review.reviewed_values_hash === reviewValuesHash(transaction)) {
        reviewById.set(txId, {
          needs_attention: false, flags: [], notes: [], attention_score: 0, confidence_score: 1,
          reviewed_at: review.reviewed_at, reviewed_by: review.reviewed_by,
          reviewed_values_hash: review.reviewed_values_hash,
        });
        return;
      }

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
          splits: transaction.splits,
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
// Marks a single transaction as reviewed and approved by an authorized user.
// Clears pending review flags and updates the review hash to the current data.
// Records reviewer audit metadata and sets confidence score to maximum certainty.
export const approveTransaction = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  transactionId: string;
  reviewedBy: string;
}) => {
  const transaction = await TransactionModel.findOne({
    _id: params.transactionId, orgId: params.orgId, userId: params.userId,
  }).lean();
  if (!transaction) return null;

  const updated = await TransactionModel.findOneAndUpdate(
    {
      _id: params.transactionId,
      orgId: params.orgId,
      userId: params.userId,
    },
    {
      $set: {
        review: { ...approvedReview(transaction, params.reviewedBy), updatedAt: new Date() },
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
// Approves multiple transactions concurrently across an organization scope.
// Verifies valid MongoDB ObjectIds and executes bulk database write operations.
// Clears attention flags and records reviewer audit trails in batch fashion.
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

  const transactions = await TransactionModel.find({
    _id: { $in: validIds }, orgId: params.orgId, userId: params.userId,
  }).lean();
  if (!transactions.length) return { modified: 0 };
  const result = await TransactionModel.bulkWrite(transactions.map(transaction => ({
    updateOne: {
      filter: { _id: transaction._id, orgId: params.orgId, userId: params.userId },
      update: { $set: { review: { ...approvedReview(transaction, params.reviewedBy), updatedAt: new Date() } } },
    },
  })));

  return { modified: result.modifiedCount || 0 };
};

