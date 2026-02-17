import crypto from "crypto";

export const normalizeUserText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const buildProcessCommandCacheKey = (params: {
  userId: string;
  profileUpdatedAt: string;
  transactionsUpdatedAt?: string;
  journalUpdatedAt?: string;
  command: string;
  narrative?: boolean;
}) => {
  const normalized = normalizeUserText(params.command);
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const journalUpdatedAt = params.journalUpdatedAt || "";
  const narrative = params.narrative === undefined ? "" : params.narrative ? "1" : "0";
  return sha256(
    `process-command|${params.userId}|${params.profileUpdatedAt}|${txUpdatedAt}|${journalUpdatedAt}|${narrative}|${normalized}`
  );
};

export const buildChatMessageCacheKey = (params: {
  userId: string;
  profileUpdatedAt: string;
  transactionsUpdatedAt?: string;
  journalUpdatedAt?: string;
  sessionId: string;
  sessionMessageCount: number;
  sessionSummaryUpdatedAt?: string;
  content: string;
  narrative?: boolean;
}) => {
  const normalized = normalizeUserText(params.content);
  const summaryUpdatedAt = params.sessionSummaryUpdatedAt || "";
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const journalUpdatedAt = params.journalUpdatedAt || "";
  const narrative = params.narrative === undefined ? "" : params.narrative ? "1" : "0";
  return sha256(
    `chat-message|${params.userId}|${params.profileUpdatedAt}|${txUpdatedAt}|${journalUpdatedAt}|${narrative}|${params.sessionId}|${params.sessionMessageCount}|${summaryUpdatedAt}|${normalized}`
  );
};

export const ttlMs = {
  processCommand: 6 * 60 * 60 * 1000,
  chatMessage: 30 * 60 * 1000,
  transactionsSummary: 15 * 60 * 1000
};

export const buildTransactionsSummaryCacheKey = (params: {
  userId: string;
  from: string;
  to: string;
  groupBy: string;
  topCategories: number;
  transactionsUpdatedAt?: string;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  return sha256(
    `transactions-summary|${params.userId}|${params.from}|${params.to}|${params.groupBy}|${params.topCategories}|${txUpdatedAt}`
  );
};
