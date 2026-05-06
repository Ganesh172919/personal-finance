/**
 * @fileoverview Transaction Model
 *
 * This module defines the Transaction schema and model for the Personal Finance application.
 * It represents financial transactions (income, expenses, investments) with comprehensive
 * tracking, categorization, and reconciliation features.
 *
 * KEY FEATURES:
 * - Transaction types: income, expense, investment
 * - Organization and user scoping (multi-tenancy)
 * - Category and merchant tracking
 * - Transaction splitting for complex transactions
 * - Source tracking (manual, CSV import, receipt OCR, AI, etc.)
 * - Review system with flags and attention scoring
 * - Reconciliation workflow (unreconciled, cleared, reconciled)
 * - Import details for tracking data provenance
 * - Full-text search on description and category
 * - Running balance tracking
 *
 * TRANSACTION LIFECYCLE:
 * 1. Created (manual, import, OCR, AI)
 * 2. Categorized (automatic or manual)
 * 3. Reviewed (flags, attention scoring)
 * 4. Reconciled (cleared, reconciled)
 *
 * @module models/transactionModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM
import type { MutationSource } from "../types/provenance"; // Provenance tracking types
import { orgScopePlugin } from "../utils/orgScopePlugin"; // Organization scope plugin

/**
 * Transaction Type Enum
 *
 * Defines the types of financial transactions.
 */
export type TransactionType = "income" | "expense" | "investment";

/**
 * Transaction Source Interface
 *
 * Extends MutationSource for provenance tracking.
 * Tracks where the transaction came from (manual, import, AI, etc.)
 */
export interface ITransactionSource extends MutationSource {}

/**
 * Transaction Record Interface
 *
 * Defines the structure of a transaction document in MongoDB.
 */
export interface ITransactionRecord {
  orgId: Types.ObjectId; // Organization that owns this transaction
  userId: Types.ObjectId; // User who created/owns the transaction
  externalId?: string; // External ID (for imports, bank feeds)
  accountId?: Types.ObjectId; // Financial account this transaction belongs to
  merchantId?: Types.ObjectId; // Merchant/vendor for this transaction
  runningBalance?: number; // Account balance after this transaction
  amount: number; // Transaction amount (positive for income, negative for expense)
  category: string; // Transaction category (e.g., "Food", "Transportation")
  description: string; // Transaction description
  date: Date; // Transaction date
  type: TransactionType; // Transaction type (income, expense, investment)
  splits?: Array<{ // Optional transaction splits
    category: string; // Split category
    amount: number; // Split amount
  }>;
  source?: ITransactionSource; // Transaction source/provenance
  review?: { // Review information
    needs_attention: boolean; // Whether transaction needs attention
    flags: Array<"uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate">; // Review flags
    notes?: string[]; // Review notes
    attention_score?: number; // Attention score (higher = more attention needed)
    confidence_score?: number; // Category confidence score (0.0–1.0, higher = more confident)
    reviewed_at?: Date; // When the transaction was approved/reviewed
    reviewed_by?: string; // User ID who reviewed/approved the transaction
    updatedAt?: Date; // When review was last updated
  };
  reconciliation?: { // Reconciliation information
    status?: "unreconciled" | "cleared" | "reconciled"; // Reconciliation status
    reference?: string; // Reconciliation reference
    statementDate?: Date; // Statement date
    statementBalance?: number; // Statement balance
    reconciledAt?: Date; // When transaction was reconciled
  };
  importDetails?: { // Import tracking information
    importId?: string; // Import batch ID
    fileName?: string; // Source file name
    rowIndex?: number; // Row index in source file
    duplicateKey?: string; // Duplicate detection key
    committedAt?: Date; // When import was committed
  };
  legacyId?: Types.ObjectId; // Legacy system ID (for migration)
  createdAt: Date; // When transaction was created
  updatedAt: Date; // When transaction was last updated
}

/**
 * Transaction Record Document Interface
 *
 * Extends ITransactionRecord with Mongoose Document methods and _id field.
 */
export interface ITransactionRecordDocument extends ITransactionRecord, Document {
  _id: Types.ObjectId; // MongoDB ObjectId
}

/**
 * Transaction Schema Definition
 *
 * Defines the structure and validation rules for transaction documents.
 *
 * FIELD OPTIONS:
 * - required: Field must be present
 * - ref: Reference to another collection
 * - index: Create database index for faster queries
 * - trim: Remove leading/trailing whitespace
 * - maxlength: String length constraints
 * - default: Default value if not provided
 * - enum: Restrict to specific values
 * - min: Minimum numeric value
 */
const transactionSchema = new Schema<ITransactionRecordDocument>(
  {
    // Organization that owns this transaction (indexed)
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    // User who created/owns the transaction (indexed)
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // External ID for imports and bank feeds (max 120 chars)
    externalId: { type: String, required: false, trim: true, maxlength: 120 },
    // Financial account this transaction belongs to (indexed)
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: false, index: true },
    // Merchant/vendor for this transaction (indexed)
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: false, index: true },
    // Account balance after this transaction
    runningBalance: { type: Number, required: false },
    // Transaction amount (positive for income, negative for expense)
    amount: { type: Number, required: true },
    // Transaction category (max 100 chars)
    category: { type: String, required: true, trim: true, maxlength: 100 },
    // Transaction description (max 250 chars)
    description: { type: String, required: true, trim: true, maxlength: 250 },
    // Transaction date (indexed)
    date: { type: Date, required: true, index: true },
    // Transaction type (income, expense, investment)
    type: { type: String, required: true, enum: ["income", "expense", "investment"], index: true },

    /**
     * Transaction Splits
     *
     * Optional array of split transactions for complex transactions.
     * Each split has a category and amount.
     */
    splits: {
      type: [
        {
          category: { type: String, required: true, trim: true, maxlength: 100 }, // Split category
          amount: { type: Number, required: true }, // Split amount
        },
      ],
      required: false,
      default: undefined,
    },

    /**
     * Transaction Source/Provenance
     *
     * Tracks where the transaction came from and who/what created it.
     */
    source: {
      origin: {
        type: String,
        enum: ["manual", "csv_import", "receipt_ocr", "journal", "task_completion", "ai_plan", "connector"],
      },
      request_id: { type: String }, // Request ID for tracing
      task_id: { type: String }, // Task ID (for async operations)
      agent_output_id: { type: String }, // AI agent output ID
      receipt_id: { type: String }, // Receipt ID (for OCR)
      journal_entry_id: { type: String }, // Journal entry ID
      action_link_id: { type: String }, // Action link ID
      actor_type: { type: String, enum: ["user", "system", "agent"] }, // Who/what created it
      source_ref: { type: String }, // External reference
      note: { type: String }, // Additional notes
    },

    /**
     * Review Information
     *
     * Tracks review status, flags, and attention scoring.
     */
    review: {
      needs_attention: { type: Boolean, default: false }, // Whether transaction needs attention
      flags: {
        type: [
          {
            type: String,
            enum: ["uncategorized", "suspected_duplicate", "needs_merchant_match", "split_candidate", "recurring_candidate"],
          },
        ],
        default: [],
      },
      notes: { type: [String], default: [] }, // Review notes
      attention_score: { type: Number, default: 0 }, // Attention score (higher = more attention needed)
      confidence_score: { type: Number, min: 0, max: 1, default: null }, // Category confidence (0.0–1.0)
      reviewed_at: { type: Date }, // When the transaction was approved/reviewed
      reviewed_by: { type: String, trim: true, maxlength: 64 }, // User ID who reviewed/approved
      updatedAt: { type: Date }, // When review was last updated
    },

    /**
     * Reconciliation Information
     *
     * Tracks reconciliation workflow and status.
     */
    reconciliation: {
      status: {
        type: String,
        enum: ["unreconciled", "cleared", "reconciled"],
        default: "unreconciled",
      },
      reference: { type: String, trim: true, maxlength: 120 }, // Reconciliation reference
      statementDate: { type: Date }, // Statement date
      statementBalance: { type: Number }, // Statement balance
      reconciledAt: { type: Date }, // When transaction was reconciled
    },

    /**
     * Import Details
     *
     * Tracks information about how the transaction was imported.
     */
    importDetails: {
      importId: { type: String, trim: true, maxlength: 64 }, // Import batch ID
      fileName: { type: String, trim: true, maxlength: 260 }, // Source file name
      rowIndex: { type: Number, min: 1 }, // Row index in source file
      duplicateKey: { type: String, trim: true, maxlength: 120 }, // Duplicate detection key
      committedAt: { type: Date }, // When import was committed
    },

    // Legacy system ID (for migration)
    legacyId: { type: Schema.Types.ObjectId, required: false }
  },
  { timestamps: true } // Automatically add createdAt and updatedAt fields
);

/**
 * Organization Scope Plugin
 *
 * Adds organization isolation to all queries.
 * Warns in development if queries don't include orgId.
 */
transactionSchema.plugin(orgScopePlugin);

/**
 * Database Indexes
 *
 * Compound indexes for common query patterns:
 * - orgId + userId + date: For user transaction history
 * - orgId + userId + accountId + date: For account transaction history
 * - orgId + userId + merchantId + date: For merchant transaction history
 * - orgId + userId + type + date: For transaction type filtering
 * - orgId + userId + category + date: For category filtering
 * - orgId + userId + source.origin + date: For source filtering
 * - orgId + externalId: For unique external ID lookup (sparse)
 * - legacyId: For legacy system migration (sparse)
 * - orgId + date + amount: For budget envelope aggregation
 * - description + category: Full-text search with weights
 */
transactionSchema.index({ orgId: 1, userId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, accountId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, merchantId: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, type: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, category: 1, date: -1 });
transactionSchema.index({ orgId: 1, userId: 1, "source.origin": 1, date: -1 });
transactionSchema.index({ orgId: 1, externalId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ orgId: 1, date: -1, amount: 1 }); // budget envelope aggregation

/**
 * Full-Text Search Index
 *
 * Enables full-text search on description and category fields.
 * Description has higher weight (3) than category (1).
 */
transactionSchema.index(
  { description: "text", category: "text" },
  { name: "txn_text_search", weights: { description: 3, category: 1 } },
);

/**
 * Transaction Model
 *
 * Mongoose model for transaction documents.
 * Used for CRUD operations on transaction data.
 */
const TransactionModel = model<ITransactionRecordDocument>("Transaction", transactionSchema);
export default TransactionModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Core Financial Record
 *    This is the most data-rich model in the system. Every income, expense, or
 *    investment event is captured as a Transaction document. The model supports
 *    the full lifecycle from creation through categorization, review, and reconciliation.
 *
 * 2. Multi-Tenancy via orgScopePlugin
 *    The `orgScopePlugin` is applied to this schema to enforce that all queries
 *    include an `orgId` filter. In development, it warns when a query omits orgId,
 *    preventing accidental cross-tenant data leaks. This is the primary defense
 *    mechanism for data isolation.
 *
 * 3. Provenance Tracking (source)
 *    The `source` sub-document records where each transaction came from: manual entry,
 *    CSV import, receipt OCR, AI agent, journal entry, or external connector. The
 *    `actor_type` field distinguishes between human users, automated systems, and AI
 *    agents. This provenance data is critical for auditing and debugging data quality.
 *
 * 4. Review and Attention System
 *    The `review` sub-document implements a flagging system for transactions that need
 *    human attention. Flags like "uncategorized", "suspected_duplicate", and
 *    "split_candidate" are set automatically by import and AI processes. The
 *    `attention_score` provides a numeric priority for sorting review queues.
 *
 * 5. Reconciliation Workflow
 *    The `reconciliation` sub-document tracks a three-state workflow:
 *    "unreconciled" -> "cleared" -> "reconciled". This mirrors traditional accounting
 *    practices where transactions are matched against bank statements.
 *
 * 6. Import Deduplication
 *    The `importDetails` sub-document includes a `duplicateKey` field used during
 *    CSV imports to detect and skip transactions that have already been imported.
 *    Combined with the unique sparse index on (orgId, externalId), this prevents
 *    duplicate financial records.
 *
 * 7. Full-Text Search
 *    The weighted text index on `description` (weight: 3) and `category` (weight: 1)
 *    enables natural language search across transactions, with results prioritized
 *    by description relevance.
 *
 * 8. Index Design
 *    The compound indexes are carefully designed for the most common query patterns:
 *    - User transaction history (sorted by date)
 *    - Account-level transaction listing
 *    - Merchant spending analysis
 *    - Category-based filtering
 *    - Source-based filtering (e.g., "show only imported transactions")
 *    - Budget envelope aggregation (orgId + date + amount)
 *
 * 9. Relationships
 *    - orgId -> Organization (multi-tenancy)
 *    - userId -> User (transaction owner)
 *    - accountId -> Account (the financial account this transaction belongs to)
 *    - merchantId -> Merchant (the vendor/merchant for this transaction)
 *    - legacyId -> legacy system ID (for data migration)
 *
 * =============================================================================
 */
