/**
 * @fileoverview AI Request Builder Service
 *
 * PURPOSE:
 * This module is the "translator" between our internal data model and the AI Core
 * service's expected input format. While aiCoreClient.ts handles HTTP communication,
 * this module handles DATA TRANSFORMATION -- converting user profiles, transactions,
 * and settings into the normalized payload the Python AI service needs.
 *
 * WHY A SEPARATE BUILDER?
 * 1. The AI service has strict input requirements (specific field names, types, ranges)
 * 2. Our internal data model may differ (different field names, nullable fields)
 * 3. We need to truncate/limit data before sending (300 transaction max, 365 day cutoff)
 * 4. Separation of concerns: data shaping vs. network communication
 *
 * NORMALIZATION PHILOSOPHY:
 * Every normalization function uses defensive coding -- unknown inputs get safe defaults
 * rather than throwing errors. This prevents crashes from unexpected data shapes and
 * ensures the AI service always receives a well-formed request.
 *
 * KEY CONSTANTS:
 * - DEFAULT_TX_MAX_ITEMS (300): Balances AI context window limits vs. data freshness
 * - DEFAULT_TX_MAX_AGE_DAYS (365): One year of history is typically sufficient for advice
 * - DEFAULT_GOAL_TIMELINE_MONTHS (12): Used when a goal has no explicit deadline
 * - DEFAULT_TIME_HORIZON_YEARS (10): Default investment planning horizon
 * - DEFAULT_CURRENCY/LOCALE/TIMEZONE: Safe fallbacks for missing org settings
 *
 * @module services/aiRequestBuilder
 */

import type { AiCoreProcessRequest } from "./aiCoreClient"; // Import request type from the client module

/**
 * Default Constants
 *
 * These values serve two purposes:
 * 1. As fallbacks when user/org settings are missing
 * 2. As performance safeguards to prevent sending excessive data to the AI service
 */
const DEFAULT_GOAL_TIMELINE_MONTHS = 12; // Default goal timeline in months (used when no deadline set)
const DEFAULT_TIME_HORIZON_YEARS = 10; // Default investment planning horizon
const DEFAULT_TX_MAX_ITEMS = 300; // Maximum transactions to send -- balances AI context window vs. data richness
const DEFAULT_TX_MAX_AGE_DAYS = 365; // Maximum age for transactions (1 year) -- older data is less relevant
const DEFAULT_CURRENCY = "USD"; // ISO 4217 currency code fallback
const DEFAULT_LOCALE = "en-US"; // BCP 47 locale fallback
const DEFAULT_TIMEZONE = "UTC"; // IANA timezone fallback

/**
 * Conversation Message Type
 *
 * Represents a message in the conversation history.
 */
export type ConversationMessage = { role: "user" | "assistant"; content: string };

/**
 * Transaction Like Type
 *
 * Represents a transaction with flexible types for normalization.
 */
type TransactionLike = {
  amount: unknown; // Transaction amount
  category?: unknown; // Transaction category
  description?: unknown; // Transaction description
  date?: unknown; // Transaction date
  type?: unknown; // Transaction type
};

/**
 * Transactions Context Type
 *
 * Contains transactions and total count for processing.
 */
type TransactionsContext = {
  transactions?: Array<TransactionLike>; // Array of transactions
  totalTransactions?: number; // Total number of transactions
};

/**
 * Organization Settings Type
 *
 * Contains organization-specific settings for AI processing.
 */
type OrgSettingsLike = {
  currency?: unknown; // Currency code
  locale?: unknown; // Locale setting
  timezone?: unknown; // Timezone setting
};

/**
 * Financial Profile Type
 *
 * Represents a user's financial profile for AI processing.
 */
type FinancialProfileLike = {
  age?: unknown; // User's age
  annual_income?: unknown; // Annual income
  monthly_expenses?: unknown; // Monthly expenses
  savings?: unknown; // Total savings
  debts?: Array<{
    name?: unknown; // Debt name
    balance?: unknown; // Debt balance
    interest_rate?: unknown; // Interest rate
    minimum_payment?: unknown; // Minimum payment
    type?: unknown; // Debt type
  }>;
  goals?: Array<{
    name?: unknown; // Goal name
    target?: unknown; // Target amount
    deadline?: unknown; // Goal deadline
    priority?: unknown; // Goal priority
  }>;
  risk_tolerance?: unknown; // Risk tolerance level
  investment_experience?: unknown; // Investment experience level
  time_horizon?: unknown; // Investment time horizon
  transactions?: Array<TransactionLike>; // Transaction history
  updatedAt?: Date; // Last update timestamp
};

/**
 * Converts a value to a number, returning 0 if not finite.
 *
 * @param {unknown} value - Value to convert
 * @returns {number} Number value or 0
 */
/**
 * Safe number conversion. Returns 0 for NaN, Infinity, null, undefined, etc.
 * Used throughout to prevent Math operations on non-numeric values.
 */
const toNumberOrZero = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Converts a value to a string, returning empty string if null/undefined.
 *
 * @param {unknown} value - Value to convert
 * @returns {string} String value or empty string
 */
const toStringOrEmpty = (value: unknown) => (value === undefined || value === null ? "" : String(value));

/**
 * Normalizes a date value to YYYY-MM-DD format.
 *
 * @param {unknown} value - Date value to normalize
 * @returns {string | null} Normalized date string or null if invalid
 */
/**
 * Converts any date-like value to YYYY-MM-DD format.
 * Returns null for invalid dates rather than throwing.
 * The AI service expects dates in this specific format for consistency.
 */
const normalizeDateToYmd = (value: unknown): string | null => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null; // Invalid date -- caller should filter this out
  }
  return date.toISOString().slice(0, 10); // Extract YYYY-MM-DD portion
};

/**
 * Calculates timeline months from deadline string.
 *
 * @param {string} [deadline] - Deadline date string
 * @returns {number} Timeline in months (minimum 1)
 */
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

/**
 * Normalizes transaction type based on value and amount.
 *
 * @param {unknown} value - Transaction type value
 * @param {number} amount - Transaction amount
 * @returns {"income" | "expense" | "investment"} Normalized transaction type
 */
/**
 * Normalizes transaction type. Falls back to inferring from the sign of the amount
 * when the type is missing or unrecognized. This handles CSV imports where the
 * type column may be empty.
 */
const normalizeTransactionType = (value: unknown, amount: number): "income" | "expense" | "investment" => {
  const normalized = toStringOrEmpty(value).toLowerCase().trim();
  if (normalized === "income" || normalized === "expense" || normalized === "investment") {
    return normalized;
  }
  // Heuristic: positive amounts are income, negative are expenses
  return amount >= 0 ? "income" : "expense";
};

/**
 * Normalizes currency code to ISO 4217 format.
 *
 * @param {unknown} value - Currency code value
 * @returns {string} Normalized currency code (3 uppercase letters)
 */
/**
 * Validates currency codes against ISO 4217 format (3 uppercase letters).
 * Returns DEFAULT_CURRENCY ("USD") for any invalid input.
 */
const normalizeCurrencyCode = (value: unknown) => {
  const normalized = toStringOrEmpty(value).toUpperCase().trim();
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
    return normalized; // Valid ISO 4217 code (e.g., "USD", "EUR", "INR")
  }
  return DEFAULT_CURRENCY;
};

/**
 * Normalizes locale string.
 *
 * @param {unknown} value - Locale value
 * @returns {string} Normalized locale string
 */
const normalizeLocale = (value: unknown) => {
  const normalized = toStringOrEmpty(value).trim();
  return normalized || DEFAULT_LOCALE;
};

/**
 * Normalizes timezone string.
 *
 * @param {unknown} value - Timezone value
 * @returns {string} Normalized timezone string
 */
const normalizeTimezone = (value: unknown) => {
  const normalized = toStringOrEmpty(value).trim();
  return normalized || DEFAULT_TIMEZONE;
};

/**
 * Build User Profile Result Type
 *
 * Contains the normalized user profile and transaction statistics.
 */
export type BuildUserProfileResult = {
  user_profile: Record<string, unknown>; // Normalized user profile
  stats: {
    totalTransactions: number; // Total transactions available
    sentTransactions: number; // Transactions sent to AI
    droppedTransactions: number; // Transactions dropped due to limits
  };
};

/**
 * Builds a normalized user profile for AI Core processing.
 *
 * This function transforms a financial profile and transactions into the format
 * expected by the AI Core service. It handles:
 * - Transaction normalization and filtering
 * - Age cutoff for transactions
 * - Transaction limits for performance
 * - Currency, locale, and timezone normalization
 * - Debt and goal normalization
 *
 * @param {FinancialProfileLike} profile - User's financial profile
 * @param {TransactionsContext} [txContext={}] - Transaction context
 * @param {object} [opts={}] - Options for profile building
 * @param {number} [opts.maxTransactions] - Maximum transactions to include
 * @param {number} [opts.maxAgeDays] - Maximum age for transactions in days
 * @param {OrgSettingsLike} [opts.orgSettings] - Organization settings
 * @returns {BuildUserProfileResult} Normalized profile and statistics
 */
/**
 * Builds a normalized user profile for AI Core processing.
 *
 * This is the main transformation function. It takes raw user data from the
 * database and converts it into the exact format the AI service expects.
 *
 * TRANSACTION PIPELINE:
 * 1. Extract raw transactions (from context or profile)
 * 2. Normalize each transaction (amount, date, type, category)
 * 3. Filter out invalid dates
 * 4. Filter by age cutoff (default 365 days)
 * 5. Sort chronologically (oldest first -- AI processes history in order)
 * 6. Trim to max items (default 300) keeping the most recent
 *
 * @param {FinancialProfileLike} profile - Raw user financial profile from database
 * @param {TransactionsContext} [txContext={}] - Transaction data (may override profile.transactions)
 * @param {object} [opts={}] - Configuration overrides
 * @param {number} [opts.maxTransactions] - Override DEFAULT_TX_MAX_ITEMS
 * @param {number} [opts.maxAgeDays] - Override DEFAULT_TX_MAX_AGE_DAYS
 * @param {OrgSettingsLike} [opts.orgSettings] - Org-level currency/locale/timezone
 * @returns {BuildUserProfileResult} Normalized profile + statistics about what was sent/dropped
 */
export const buildAiCoreUserProfile = (
  profile: FinancialProfileLike,
  txContext: TransactionsContext = {},
  opts: { maxTransactions?: number; maxAgeDays?: number; orgSettings?: OrgSettingsLike } = {}
): BuildUserProfileResult => {
  const maxTransactions = opts.maxTransactions ?? DEFAULT_TX_MAX_ITEMS;
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_TX_MAX_AGE_DAYS;
  const orgSettings = opts.orgSettings || {};

  // STEP 1: Resolve transactions -- prefer txContext (explicit) over profile (embedded)
  const rawTransactions = Array.isArray(txContext.transactions)
    ? txContext.transactions
    : Array.isArray(profile.transactions)
      ? profile.transactions
      : [];
  // totalTransactions may differ from rawTransactions.length (e.g., when filtered by account)
  const totalTransactions = Number.isFinite(Number(txContext.totalTransactions))
    ? Number(txContext.totalTransactions)
    : rawTransactions.length;

  // STEP 2: Calculate the date cutoff -- transactions older than this are excluded
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  // STEP 3: Normalize each transaction to a consistent shape, then filter and sort
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
    .filter(tx => tx.date !== null) // Remove transactions with unparseable dates
    .filter(tx => new Date(tx.date as string).getTime() >= cutoff.getTime()) // Remove old transactions
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()); // Chronological order (oldest first)

  // STEP 4: Trim to max items, keeping the MOST RECENT transactions
  // slice(-N) takes the last N elements, which are the most recent after sorting
  const trimmed = normalized.slice(Math.max(0, normalized.length - maxTransactions));

  // Calculate dropped transactions
  const droppedTransactions = Math.max(0, totalTransactions - trimmed.length);

  // Get debts and goals
  const debts = Array.isArray(profile.debts) ? profile.debts : [];
  const goals = Array.isArray(profile.goals) ? profile.goals : [];

  return {
    user_profile: {
      age: toNumberOrZero(profile.age) || 30, // Default age if not provided
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
      risk_tolerance: toStringOrEmpty(profile.risk_tolerance) || "moderate", // Default risk tolerance
      investment_experience: toStringOrEmpty(profile.investment_experience) || "beginner", // Default experience
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

/**
 * Builds a process request for the AI Core service.
 *
 * This function creates a complete request object for the AI Core service,
 * including user profile, transactions, and processing options.
 *
 * @param {object} params - Request parameters
 * @param {string} params.userInput - User's input command
 * @param {FinancialProfileLike | null} params.profile - User's financial profile
 * @param {Record<string, unknown>} [params.financeContext] - Financial context
 * @param {string} [params.orgId] - Organization ID
 * @param {string} [params.userId] - User ID
 * @param {string} [params.sessionId] - Session ID
 * @param {boolean} [params.resumeFromCheckpoint] - Whether to resume from checkpoint
 * @param {OrgSettingsLike} [params.orgSettings] - Organization settings
 * @param {TransactionLike[]} [params.transactions] - Transaction history
 * @param {number} [params.totalTransactions] - Total transaction count
 * @param {ConversationMessage[]} [params.conversationHistory] - Conversation history
 * @param {string} [params.sessionSummary] - Session summary
 * @param {boolean} [params.narrative] - Whether to include narrative
 * @returns {object} Request object and statistics
 */
/**
 * Builds a complete process request for the AI Core service.
 *
 * This is the top-level function called by controllers. It assembles all the
 * pieces (user profile, transactions, conversation history, settings) into a
 * single request object that matches AiCoreProcessRequest.
 *
 * NOTE ON NAMING: The request uses snake_case field names because the Python
 * AI service expects them. This is intentional -- the builder handles the
 * naming convention translation so our TypeScript code can use camelCase.
 *
 * @param {object} params - All request parameters aggregated
 * @returns {{ request: AiCoreProcessRequest; stats: BuildUserProfileResult["stats"] }}
 *   - request: The complete payload ready to send to aiCoreClient
 *   - stats: Statistics about transaction processing (for logging/UI)
 */
export const buildProcessRequest = (params: {
  userInput: string;
  profile: FinancialProfileLike | null;
  financeContext?: Record<string, unknown>;
  orgId?: string;
  userId?: string;
  sessionId?: string;
  resumeFromCheckpoint?: boolean;
  orgSettings?: OrgSettingsLike;
  transactions?: TransactionLike[];
  totalTransactions?: number;
  conversationHistory?: ConversationMessage[];
  sessionSummary?: string;
  narrative?: boolean;
}): { request: AiCoreProcessRequest; stats: BuildUserProfileResult["stats"] } => {
  // Build normalized user profile if profile data exists
  // When profile is null (e.g., first-time user), send null to the AI service
  // so it can provide onboarding advice instead of personalized analysis
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
      finance_context: params.financeContext,
      org_id: params.orgId,
      user_id: params.userId,
      session_id: params.sessionId,
      resume_from_checkpoint: params.resumeFromCheckpoint,
      conversation_history: params.conversationHistory,
      session_summary: params.sessionSummary,
      // The "narrative" flag controls whether the AI returns conversational text
      // vs. structured data. When undefined, default options are applied.
      options:
        params.narrative === undefined
          ? { include_evidence: true, include_confidence: true, include_actions: true }
          : {
              narrative: params.narrative,
              include_evidence: true,
              include_confidence: true,
              include_actions: true,
            },
    },
    stats,
  };
};

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. DATA TRANSFORMATION LAYER: This module is purely about shape conversion.
//    It takes messy, nullable, inconsistent data from the database and produces
//    clean, typed, normalized payloads for the AI service.
//
// 2. DEFENSIVE NORMALIZATION: Every helper (toNumberOrZero, toStringOrEmpty,
//    normalizeDateToYmd, etc.) handles edge cases gracefully. Unknown types,
//    null values, and unexpected formats all get safe defaults.
//
// 3. PERFORMANCE BOUNDARIES: The transaction pipeline (filter by date, limit
//    count, sort) prevents sending massive datasets to the AI service, which
//    would waste tokens and slow down responses.
//
// 4. ORGANIZATION SETTINGS: Currency, locale, and timezone flow from org settings
//    to the AI request, enabling the AI to give advice in the user's local context
//    (e.g., "your monthly rent of Rs. 25,000" instead of "$300").
//
// 5. STATISTICS RETURNED: The build functions return stats (total, sent, dropped
//    transactions) alongside the payload. These stats are logged and displayed
//    in the UI to give users transparency about what data the AI is using.
// =============================================================================
