import type { AiCoreProcessRequest } from "./aiCoreClient";

const DEFAULT_GOAL_TIMELINE_MONTHS = 12;
const DEFAULT_TIME_HORIZON_YEARS = 10;
const DEFAULT_TX_MAX_ITEMS = 300;
const DEFAULT_TX_MAX_AGE_DAYS = 365;
const DEFAULT_CURRENCY = "USD";
const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIMEZONE = "UTC";

export type ConversationMessage = { role: "user" | "assistant"; content: string };

type TransactionLike = {
  amount: unknown;
  category?: unknown;
  description?: unknown;
  date?: unknown;
  type?: unknown;
};

type TransactionsContext = {
  transactions?: Array<TransactionLike>;
  totalTransactions?: number;
};

type OrgSettingsLike = {
  currency?: unknown;
  locale?: unknown;
  timezone?: unknown;
};

type FinancialProfileLike = {
  age?: unknown;
  annual_income?: unknown;
  monthly_expenses?: unknown;
  savings?: unknown;
  debts?: Array<{
    name?: unknown;
    balance?: unknown;
    interest_rate?: unknown;
    minimum_payment?: unknown;
    type?: unknown;
  }>;
  goals?: Array<{
    name?: unknown;
    target?: unknown;
    deadline?: unknown;
    priority?: unknown;
  }>;
  risk_tolerance?: unknown;
  investment_experience?: unknown;
  time_horizon?: unknown;
  transactions?: Array<TransactionLike>;
  updatedAt?: Date;
};

const toNumberOrZero = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toStringOrEmpty = (value: unknown) => (value === undefined || value === null ? "" : String(value));

const normalizeDateToYmd = (value: unknown): string | null => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

const getTimelineMonths = (deadline?: string) => {
  if (!deadline) {
    return DEFAULT_GOAL_TIMELINE_MONTHS;
  }

  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) {
    return DEFAULT_GOAL_TIMELINE_MONTHS;
  }

  const now = new Date();
  const months =
    (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
    (deadlineDate.getMonth() - now.getMonth());

  return Math.max(1, months);
};

const normalizeTransactionType = (value: unknown, amount: number): "income" | "expense" | "investment" => {
  const normalized = toStringOrEmpty(value).toLowerCase().trim();
  if (normalized === "income" || normalized === "expense" || normalized === "investment") {
    return normalized;
  }
  return amount >= 0 ? "income" : "expense";
};

const normalizeCurrencyCode = (value: unknown) => {
  const normalized = toStringOrEmpty(value).toUpperCase().trim();
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
    return normalized;
  }
  return DEFAULT_CURRENCY;
};

const normalizeLocale = (value: unknown) => {
  const normalized = toStringOrEmpty(value).trim();
  return normalized || DEFAULT_LOCALE;
};

const normalizeTimezone = (value: unknown) => {
  const normalized = toStringOrEmpty(value).trim();
  return normalized || DEFAULT_TIMEZONE;
};

export type BuildUserProfileResult = {
  user_profile: Record<string, unknown>;
  stats: {
    totalTransactions: number;
    sentTransactions: number;
    droppedTransactions: number;
  };
};

export const buildAiCoreUserProfile = (
  profile: FinancialProfileLike,
  txContext: TransactionsContext = {},
  opts: { maxTransactions?: number; maxAgeDays?: number; orgSettings?: OrgSettingsLike } = {}
): BuildUserProfileResult => {
  const maxTransactions = opts.maxTransactions ?? DEFAULT_TX_MAX_ITEMS;
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_TX_MAX_AGE_DAYS;
  const orgSettings = opts.orgSettings || {};

  const rawTransactions = Array.isArray(txContext.transactions)
    ? txContext.transactions
    : Array.isArray(profile.transactions)
      ? profile.transactions
      : [];
  const totalTransactions = Number.isFinite(Number(txContext.totalTransactions))
    ? Number(txContext.totalTransactions)
    : rawTransactions.length;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const normalized = rawTransactions
    .map(tx => {
      const amount = toNumberOrZero(tx.amount);
      const dateYmd = normalizeDateToYmd(tx.date);
      return {
        amount,
        category: toStringOrEmpty(tx.category) || "Other",
        description: toStringOrEmpty(tx.description),
        date: dateYmd,
        type: normalizeTransactionType(tx.type, amount),
      };
    })
    .filter(tx => tx.date !== null)
    .filter(tx => new Date(tx.date as string).getTime() >= cutoff.getTime())
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

  const trimmed = normalized.slice(Math.max(0, normalized.length - maxTransactions));

  const droppedTransactions = Math.max(0, totalTransactions - trimmed.length);

  const debts = Array.isArray(profile.debts) ? profile.debts : [];
  const goals = Array.isArray(profile.goals) ? profile.goals : [];

  return {
    user_profile: {
      age: toNumberOrZero(profile.age) || 30,
      annual_income: toNumberOrZero(profile.annual_income),
      monthly_expenses: toNumberOrZero(profile.monthly_expenses),
      savings: toNumberOrZero(profile.savings),
      debts: debts.map(debt => ({
        name: toStringOrEmpty(debt.name),
        balance: toNumberOrZero(debt.balance),
        interest_rate: toNumberOrZero(debt.interest_rate),
        minimum_payment: toNumberOrZero(debt.minimum_payment),
        type: toStringOrEmpty(debt.type),
      })),
      financial_goals: goals.map(goal => ({
        name: toStringOrEmpty(goal.name) || "Goal",
        target: toNumberOrZero(goal.target),
        timeline_months: getTimelineMonths(toStringOrEmpty(goal.deadline)),
        priority: toNumberOrZero(goal.priority) || 1,
      })),
      risk_tolerance: toStringOrEmpty(profile.risk_tolerance) || "moderate",
      investment_experience: toStringOrEmpty(profile.investment_experience) || "beginner",
      time_horizon: toNumberOrZero(profile.time_horizon) || DEFAULT_TIME_HORIZON_YEARS,
      currency: normalizeCurrencyCode(orgSettings.currency),
      locale: normalizeLocale(orgSettings.locale),
      timezone: normalizeTimezone(orgSettings.timezone),
      transactions: trimmed.map(tx => ({
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
        date: tx.date,
        type: tx.type,
      })),
    },
    stats: {
      totalTransactions,
      sentTransactions: trimmed.length,
      droppedTransactions: Math.max(0, droppedTransactions),
    },
  };
};

export const buildProcessRequest = (params: {
  userInput: string;
  profile: FinancialProfileLike | null;
  orgId?: string;
  userId?: string;
  orgSettings?: OrgSettingsLike;
  transactions?: TransactionLike[];
  totalTransactions?: number;
  conversationHistory?: ConversationMessage[];
  sessionSummary?: string;
  narrative?: boolean;
}): { request: AiCoreProcessRequest; stats: BuildUserProfileResult["stats"] } => {
  const { user_profile, stats } = params.profile
    ? buildAiCoreUserProfile(params.profile, {
        transactions: params.transactions,
        totalTransactions: params.totalTransactions,
      }, { orgSettings: params.orgSettings })
    : {
        user_profile: null,
        stats: { totalTransactions: 0, sentTransactions: 0, droppedTransactions: 0 },
      };

  return {
    request: {
      user_input: params.userInput,
      user_profile,
      org_id: params.orgId,
      user_id: params.userId,
      conversation_history: params.conversationHistory,
      session_summary: params.sessionSummary,
      options: params.narrative === undefined ? undefined : { narrative: params.narrative },
    },
    stats,
  };
};
