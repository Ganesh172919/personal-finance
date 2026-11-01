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

export const ensureProfile = async (params: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<IFinancialProfileDocument> => {
  let profile = await FinancialProfileModel.findOne({ orgId: params.orgId, userId: params.userId });
  if (!profile) {
    profile = await FinancialProfileModel.create({ orgId: params.orgId, userId: params.userId, ...DEFAULT_PROFILE });
  }
  return profile;
};

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

export const setProfileMutationSource = (
  profile: IFinancialProfileDocument,
  source: MutationSource
) => {
  profile.lastMutation = {
    ...source,
    at: new Date(),
  };
};

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
