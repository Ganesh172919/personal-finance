/**
 * @fileoverview Financial Profile Management Service
 *
 * Provides lifecycle management, lazy initialization, provenance tracking,
 * and metadata synchronization for user financial profiles.
 *
 * ============================================================================
 * MINDMAP FLOW: FINANCIAL PROFILE LIFECYCLE & MUTATION PROVENANCE
 * ============================================================================
 * - Financial Profile Service
 *     ├── 1. Default Profile Definition (DEFAULT_PROFILE)
 *     │   ├── Age: 30, Income: 0, Expenses: 0, Savings: 0
 *     │   ├── Goals: [], Debts: [], Transactions: []
 *     │   └── Risk: moderate, Investment Experience: beginner
 *     ├── 2. Lazy Profile Hydration
 *     │   ├── ensureProfile(orgId, userId): Database lookup with auto-creation on first access
 *     │   └── Multi-tenant scoping: Strict isolation across orgId and userId
 *     ├── 3. Legacy Schema Migration
 *     │   └── ensureProfileWithMigration: Migrates embedded transactions to TransactionModel
 *     ├── 4. Provenance & Audit Tracking
 *     │   └── setProfileMutationSource: Records mutation source (user, AI, system) & timestamp
 *     └── 5. Transaction Sync & Cache Invalidation Hook
 *         └── bumpTransactionMetadata: Updates transaction count & transactionsUpdatedAt
 *
 * ============================================================================
 * ASCII FLOW: PROFILE HYDRATION & TRANSACTION MIGRATION PIPELINE
 * ============================================================================
 *                    [ Request Profile for (orgId, userId) ]
 *                                       |
 *                                       v
 *                    +------------------------------------+
 *                    | FinancialProfileModel.findOne()    |
 *                    +------------------+-----------------+
 *                                       |
 *                             Does Profile Exist?
 *                                    /      \
 *                             Yes   /        \ No
 *                                  v          v
 *                       [ Existing Profile ]  +--------------------------+
 *                                  |          | Create new profile with  |
 *                                  |          | DEFAULT_PROFILE limits   |
 *                                  |          +-------------+------------+
 *                                  |                        |
 *                                  +------------<-----------+
 *                                       |
 *                                       v
 *                    +------------------------------------+
 *                    | ensureProfileTransactionsMigrated  |
 *                    | Migrates legacy embedded records   |
 *                    +------------------+-----------------+
 *                                       |
 *                                       v
 *                    +------------------------------------+
 *                    | Return Initialized Profile Document|
 *                    +------------------------------------+
 *
 * @module services/profileService
 */

import type { Types } from "mongoose";
import FinancialProfileModel, { type IFinancialProfileDocument } from "../models/financialProfileModel";
import type { MutationSource } from "../types/provenance";
import { ensureProfileTransactionsMigrated } from "./transactionMigration";

// Baseline default financial profile structure for new users.
// Initializes baseline age, zeroed income and balances, and empty debt arrays.
// Establishes default moderate risk appetite and beginner investment experience.
export const DEFAULT_PROFILE = {
  age: 30,
  annual_income: 0,
  monthly_expenses: 0,
  savings: 0,
  goals: [],
  debts: [],
  transactions: [],
  risk_tolerance: "moderate" as const,
  investment_experience: "beginner" as const,
};

// Retrieves existing user financial profiles or provisions new defaults lazily.
// Handles race conditions across concurrent first-load requests via E11000 catches.
// Returns the resolved or newly initialized financial profile document.
export const ensureProfile = async (params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<IFinancialProfileDocument> => {
  const filter = { orgId: params.orgId, userId: params.userId };
  const existing = await FinancialProfileModel.findOne(filter);
  if (existing) return existing;
  try {
    return await FinancialProfileModel.create({ ...filter, ...DEFAULT_PROFILE });
  } catch (error) {
    // A brand-new user's first page load fires several requests at once (dashboard summary,
    // budget health, command center, profile). They all miss the findOne and race to create;
    // the unique { orgId, userId } index rejects all but one with E11000. The losers must
    // reuse the winner's profile instead of failing the request with a 500.
    if ((error as { code?: number })?.code === 11000) {
      const winner = await FinancialProfileModel.findOne(filter);
      if (winner) return winner;
    }
    throw error;
  }
};

// Guarantees profile presence while triggering legacy embedded transaction migrations.
// Moves legacy embedded transaction arrays into dedicated transaction collections.
// Returns the fully migrated and hydrated user profile model.
export const ensureProfileWithMigration = async (
  params: {
    orgId: Types.ObjectId;
    userId: Types.ObjectId;
  }
): Promise<IFinancialProfileDocument> => {
  const profile = await ensureProfile(params);
  await ensureProfileTransactionsMigrated(profile);
  return profile;
};

// Attaches provenance audit information to a financial profile document.
// Records the initiating actor, action links, and current timestamp.
// Guarantees traceability of user, AI, or system-driven profile adjustments.
export const setProfileMutationSource = (
  profile: IFinancialProfileDocument,
  source: MutationSource
) => {
  profile.lastMutation = {
    ...source,
    at: new Date(),
  };
};

// Updates transaction count metrics and modification timestamps on a profile.
// Supports both relative increment deltas and explicit count assignment.
// Synchronizes cache freshness indicators across transactional operations.
export const bumpTransactionMetadata = (
  profile: IFinancialProfileDocument,
  params: { deltaCount?: number; setCount?: number; at?: Date } = {}
) => {
  const at = params.at || new Date();
  const currentCount = Number(profile.transactionsCount || 0);

  if (typeof params.setCount === "number") {
    profile.transactionsCount = Math.max(0, params.setCount);
  } else {
    profile.transactionsCount = Math.max(0, currentCount + Number(params.deltaCount || 0));
  }

  profile.transactionsUpdatedAt = at;
};
