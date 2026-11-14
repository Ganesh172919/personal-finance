/**
 * @fileoverview In-memory implementation of IVoiceLedgerContextRepository.
 *
 * Provides instantaneous (<1ms) month-to-date financial metrics for unit tests,
 * CI pipelines, and offline demonstrations without requiring an active MongoDB connection.
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/inMemoryVoiceLedgerContext
 */

import type {
  IVoiceLedgerContextRepository,
  VoiceLedgerMetrics,
} from "./voiceLedgerContext.interface";

export class InMemoryVoiceLedgerRepository implements IVoiceLedgerContextRepository {
  private metricsStore = new Map<string, VoiceLedgerMetrics>();

  private defaultMetrics: VoiceLedgerMetrics = {
    totalSpentMonthToDate: 14250,
    totalIncomeMonthToDate: 50000,
    topCategory: "Groceries",
    recentTransactionsCount: 18,
  };

  /**
   * Retrieves month-to-date ledger metrics from memory or defaults.
   */
  async getLedgerMetrics(userId: string, orgId?: string): Promise<VoiceLedgerMetrics> {
    const key = `${orgId || "default"}:${userId}`;
    const stored = this.metricsStore.get(key);
    if (stored) {
      return { ...stored };
    }
    return { ...this.defaultMetrics };
  }

  /**
   * Seeds or updates metrics for a specific user/organization.
   */
  setMetrics(userId: string, orgId: string | undefined, metrics: Partial<VoiceLedgerMetrics>): void {
    const key = `${orgId || "default"}:${userId}`;
    const existing = this.metricsStore.get(key) || { ...this.defaultMetrics };
    this.metricsStore.set(key, { ...existing, ...metrics });
  }

  /**
   * Resets all stored in-memory metrics to blank state.
   */
  reset(): void {
    this.metricsStore.clear();
  }
}

export const inMemoryVoiceLedgerRepository = new InMemoryVoiceLedgerRepository();

// Aliases for alternate naming conventions
export const InMemoryVoiceLedgerContext = InMemoryVoiceLedgerRepository;
export const inMemoryVoiceLedgerContext = inMemoryVoiceLedgerRepository;
