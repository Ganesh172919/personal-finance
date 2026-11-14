/**
 * @fileoverview Interface definitions for Voice Ledger Context repository.
 *
 * Decouples Mongoose database aggregation queries from voice reasoning operations,
 * preventing 10-second query buffering timeouts when MongoDB is disconnected or
 * when running fast offline unit tests.
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/voiceLedgerContext.interface
 */

/**
 * Aggregated ledger metrics used by Gnani Evon 30B reasoning to formulate
 * grounded, personalized financial advice and spoken conversational responses.
 */
import type { SupportedCurrency } from "../../utils/currencyFx";

export interface VoiceLedgerMetrics {
  currency?: SupportedCurrency;
  totalSpentMonthToDate: number;
  totalIncomeMonthToDate: number;
  topCategory: string;
  recentTransactionsCount: number;
}

/**
 * Repository interface for retrieving month-to-date financial metrics
 * scoped to a user and organization.
 */
export interface IVoiceLedgerContextRepository {
  /**
   * Retrieves aggregated ledger metrics for the active billing month.
   *
   * @param userId Unique user identifier
   * @param orgId Optional tenant organization identifier
   */
  getLedgerMetrics(userId: string, orgId?: string): Promise<VoiceLedgerMetrics>;
}
