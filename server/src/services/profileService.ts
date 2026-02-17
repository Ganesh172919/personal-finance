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

export const ensureProfile = async (userId: Types.ObjectId): Promise<IFinancialProfileDocument> => {
  let profile = await FinancialProfileModel.findOne({ userId });
  if (!profile) {
    profile = await FinancialProfileModel.create({ userId, ...DEFAULT_PROFILE });
  }
  return profile;
};

export const ensureProfileWithMigration = async (
  userId: Types.ObjectId
): Promise<IFinancialProfileDocument> => {
  const profile = await ensureProfile(userId);
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
