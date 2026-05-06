/**
 * @fileoverview Transaction Service -- AI Data Retrieval
 *
 * PURPOSE:
 * This service fetches and normalizes transaction data specifically for AI
 * processing. It is a focused data-access layer that sits between the
 * TransactionModel (MongoDB) and the AI request builder.
 *
 * WHY A SEPARATE SERVICE?
 * The AI service needs transactions in a specific format (AiTransaction type)
 * with specific limits (max items, max age). Rather than embedding this logic
 * in the controller or the request builder, this service encapsulates the
 * data retrieval strategy for AI consumption.
 *
 * RELATIONSHIP TO OTHER MODULES:
 * - TransactionModel: Raw MongoDB queries
 * - transactionMigration: Ensures legacy data is in the correct format
 * - aiRequestBuilder: Consumes the output of this service
 * - aiCoreClient: Sends the final request to the AI service
 *
 * DATA FLOW:
 * Controller -> fetchTransactionsForAi() -> aiRequestBuilder.buildProcessRequest()
 *   -> aiCoreClient.processAiCoreRequest() -> Python AI service
 *
 * @module services/transactionService
 */

import type { Types } from "mongoose"; // MongoDB ObjectId type
import TransactionModel from "../models/transactionModel"; // Transaction MongoDB model
import { ensureUserTransactionsMigrated } from "./transactionMigration"; // Legacy data migration check

/**
 * Normalized transaction type for AI consumption.
 * All fields are guaranteed to be non-null and properly typed.
 */
export type AiTransaction = {
  amount: number; // Normalized amount (positive for income, negative for expenses)
  category: string; // Transaction category (e.g., "Food", "Rent", "Salary")
  description: string; // Transaction description (may be empty string, never null)
  date: Date; // Transaction date (guaranteed to be a valid Date object)
  type: "income" | "expense" | "investment"; // Normalized transaction type
};

/**
 * Result type including both the transactions and statistics about the fetch.
 * Stats are used for logging and displayed in the AI response metadata.
 */
export type AiTransactionFetchResult = {
  transactions: AiTransaction[]; // Normalized transactions ready for AI
  stats: {
    totalTransactions: number; // Total matching transactions in the database
    sentTransactions: number; // Number actually sent (may be less due to limits)
    droppedTransactions: number; // Transactions excluded due to age/count limits
  };
};

/**
 * Fetches transactions for AI processing with automatic migration and limits.
 *
 * PIPELINE:
 * 1. Run migration check (ensures legacy data is compatible)
 * 2. Calculate date cutoff (default 365 days ago)
 * 3. Count total matching transactions
 * 4. Fetch most recent N transactions (default 300)
 * 5. Reverse to chronological order (oldest first -- AI processes history in order)
 * 6. Normalize each document to the AiTransaction type
 *
 * PERFORMANCE NOTE: countDocuments and find run in parallel via Promise.all
 * to minimize total query time. The .lean() flag tells Mongoose to return
 * plain objects instead of full documents, which is faster for read-only use.
 *
 * @param {object} params - Fetch parameters
 * @param {Types.ObjectId} params.orgId - Organization ID (multi-tenancy)
 * @param {Types.ObjectId} params.userId - User ID
 * @param {number} [params.maxAgeDays=365] - Maximum age of transactions in days
 * @param {number} [params.maxItems=300] - Maximum number of transactions to return
 * @returns {Promise<AiTransactionFetchResult>} Transactions and fetch statistics
 */
export const fetchTransactionsForAi = async (params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  maxAgeDays?: number;
  maxItems?: number;
}): Promise<AiTransactionFetchResult> => {
  const maxAgeDays = params.maxAgeDays ?? 365; // Default: 1 year of history
  const maxItems = params.maxItems ?? 300; // Default: 300 transactions max

  // Ensure any legacy transaction data has been migrated to the current schema
  await ensureUserTransactionsMigrated({ orgId: params.orgId, userId: params.userId });

  // Calculate the date cutoff -- transactions older than this are excluded
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  // Base filter: scoped to this org + user + date range
  const filter = { orgId: params.orgId, userId: params.userId, date: { $gte: cutoff } };

  // Run count and fetch in parallel for better performance
  const [totalTransactions, docs] = await Promise.all([
    TransactionModel.countDocuments(filter), // Total matching count (for stats)
    TransactionModel.find(filter)
      .sort({ date: -1 }) // Most recent first (will be reversed below)
      .limit(maxItems) // Cap at maxItems to prevent sending too much data
      .select({ amount: 1, category: 1, description: 1, date: 1, type: 1 }) // Only needed fields
      .lean() // Return plain objects (faster, less memory)
  ]);

  // Reverse to chronological order (oldest first)
  // The AI processes transactions in order, so chronological is the natural sequence
  const reversed = [...docs].reverse();

  return {
    // Normalize each document to guarantee consistent types
    transactions: reversed.map(doc => ({
      amount: Number(doc.amount) || 0,
      category: String(doc.category || "Other"),
      description: String(doc.description || ""),
      date: doc.date instanceof Date ? doc.date : new Date(doc.date as unknown as string),
      type: doc.type as "income" | "expense" | "investment"
    })),
    stats: {
      totalTransactions,
      sentTransactions: reversed.length,
      droppedTransactions: Math.max(0, totalTransactions - reversed.length) // How many were excluded by limits
    }
  };
};

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. SINGLE RESPONSIBILITY: This module does exactly one thing -- fetch and
//    normalize transactions for AI consumption. It does not handle AI
//    communication (that's aiCoreClient) or data transformation (that's
//    aiRequestBuilder).
//
// 2. MIGRATION SAFETY: The ensureUserTransactionsMigrated call ensures that
//    legacy data formats are automatically converted before being sent to the
//    AI service. This prevents crashes from unexpected data shapes.
//
// 3. PERFORMANCE OPTIMIZATION: Parallel queries (countDocuments + find),
//    .lean() for faster reads, and field selection (.select) minimize
//    database load and response time.
//
// 4. CHRONOLOGICAL ORDER: Transactions are reversed after fetching (most recent
//    last) because the AI service processes them in order. Having the most
//    recent transactions at the end gives the AI better context for its analysis.
// =============================================================================
