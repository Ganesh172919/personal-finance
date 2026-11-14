/**
 * @fileoverview MongoDB / Mongoose implementation of IVoiceLedgerContextRepository.
 *
 * Uses stored ledger data when connected and in-memory fixtures for isolated tests.
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/mongooseVoiceLedgerContext
 */

import mongoose, { Types } from "mongoose";
import { getMonthlyLedgerSummary } from "../monthlyLedgerSummary";
import { logger } from "../../config/logger";
import { HttpError } from "../../middleware/httpError";
import type {
  IVoiceLedgerContextRepository,
  VoiceLedgerMetrics,
} from "./voiceLedgerContext.interface";
import { inMemoryVoiceLedgerRepository } from "./inMemoryVoiceLedgerContext";

export class MongooseVoiceLedgerRepository implements IVoiceLedgerContextRepository {
  async getLedgerMetrics(userId: string, orgId?: string): Promise<VoiceLedgerMetrics> {
    if (mongoose.connection.readyState !== 1) {
      if (process.env.NODE_ENV === "test") {
        return inMemoryVoiceLedgerRepository.getLedgerMetrics(userId, orgId);
      }
      throw new HttpError(503, "VOICE_LEDGER_UNAVAILABLE", "The ledger is temporarily unavailable");
    }

    const scope = orgId && Types.ObjectId.isValid(orgId)
      ? { orgId: new Types.ObjectId(orgId) }
      : !orgId && Types.ObjectId.isValid(userId)
        ? { userId: new Types.ObjectId(userId) }
        : null;
    if (!scope) throw new HttpError(400, "INVALID_LEDGER_SCOPE", "A valid workspace or user is required");

    try {
      const summary = await getMonthlyLedgerSummary(scope);
      return {
        currency: "USD",
        totalSpentMonthToDate: summary.totalSpent,
        totalIncomeMonthToDate: summary.totalIncome,
        topCategory: summary.topCategory?._id || "No expenses yet",
        recentTransactionsCount: summary.transactionCount,
      };
    } catch (err: any) {
      logger.warn(
        { err: err?.message },
        "MongoDB voice ledger aggregation failed"
      );
      throw new HttpError(503, "VOICE_LEDGER_UNAVAILABLE", "The ledger is temporarily unavailable");
    }
  }
}

export const mongooseVoiceLedgerRepository = new MongooseVoiceLedgerRepository();

// Aliases for alternate naming conventions
export const MongooseVoiceLedgerContext = MongooseVoiceLedgerRepository;
export const mongooseVoiceLedgerContext = mongooseVoiceLedgerRepository;
