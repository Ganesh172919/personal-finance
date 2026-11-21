/**
 * @fileoverview AI Response Caching Service
 *
 * Implements deterministic SHA-256 cache key generation and TTL management
 * for AI command processing and chat message queries.
 *
 * ============================================================================
 * MINDMAP FLOW: DETERMINISTIC CACHE KEY ENGINE & STATE INVARIANTS
 * ============================================================================
 * - Deterministic AI Response Cache Engine
 *     ├── 1. Preserve prompt case and internal whitespace for code and text requests
 *     ├── 2. State-Aware Cache Key Synthesis
 *     │   ├── User & Tenant Context: orgId, userId
 *     │   ├── Invalidation Timestamps:
 *     │   │   ├── profileUpdatedAt (Profile changes bust cache)
 *     │   │   ├── transactionsUpdatedAt (New/updated transactions bust cache)
 *     │   │   └── journalUpdatedAt (New financial notes bust cache)
 *     │   ├── Conversation Context: sessionId, sessionMessageCount, summaryUpdatedAt
 *     │   └── Flag Invariants: narrative (1 or 0)
 *     ├── 3. Cryptographic Hashing
 *     │   └── SHA-256 hexadecimal digest generation
 *     └── 4. Tiered TTL (Time-To-Live) Strategy
 *         ├── Process Command: 6 hours (6 * 60 * 60 * 1000 ms)
 *         └── Chat Message: 30 minutes (30 * 60 * 1000 ms)
 *
 * ============================================================================
 * ASCII FLOW: CACHE KEY GENERATION & INVALIDATION LIFECYCLE
 * ============================================================================
 *                  [ Incoming AI Command or Chat Message ]
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Gather Context Mutation Timestamps:  |
 *                  | - profileUpdatedAt                   |
 *                  | - transactionsUpdatedAt              |
 *                  | - journalUpdatedAt                   |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Preserve the submitted prompt        |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | Concatenate Pipeline Tokens:         |
 *                  | "prefix|org|user|pTime|txTime|..."   |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | crypto.createHash("sha256")          |
 *                  | -> Hexadecimal Key String            |
 *                  +------------------+-------------------+
 *                                     |
 *                                     v
 *                  +--------------------------------------+
 *                  | AiResponseCacheModel.findOne(key)    |
 *                  +------------------+-------------------+
 *                                /          \
 *                       Cache Hit            Cache Miss
 *                              /              \
 *                             v                v
 *                  [ Return Instant Cached ] [ Execute AI Core Graph ]
 *                  [ Latency: < 5ms        ] [ Save to Cache with TTL]
 *
 * @module services/aiCache
 */

import crypto from "crypto";

// Computes a cryptographic SHA-256 hash digest encoded as a hexadecimal string.
// Provides fixed-length, collision-resistant string representations for caching.
// Used across key synthesis functions to produce uniform database lookup keys.
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Constructs a state-sensitive SHA-256 cache key for an AI command processing request.
// Combines user identity, dataset update timestamps, command text, and formatting flags.
// Automatically invalidates cached responses whenever profiles or transactions update.
export const buildProcessCommandCacheKey = (params: {
  orgId: string;
  userId: string;
  profileUpdatedAt: string;
  transactionsUpdatedAt?: string;
  journalUpdatedAt?: string;
  command: string;
  narrative?: boolean;
}) => {
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const journalUpdatedAt = params.journalUpdatedAt || "";
  const narrative = params.narrative === undefined ? "" : params.narrative ? "1" : "0";
  return sha256(
    `process-command-v3|${params.orgId}|${params.userId}|${params.profileUpdatedAt}|${txUpdatedAt}|${journalUpdatedAt}|${narrative}|${params.command.trim()}`
  );
};

// Synthesizes a state-aware deterministic cache key for an AI chat conversation turn.
// Incorporates tenant identifiers, chat session progress counters, and mutation timestamps.
// Guarantees that ongoing conversation changes properly invalidate stale cached replies.
export const buildChatMessageCacheKey = (params: {
  orgId: string;
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
  const summaryUpdatedAt = params.sessionSummaryUpdatedAt || "";
  const txUpdatedAt = params.transactionsUpdatedAt || "";
  const journalUpdatedAt = params.journalUpdatedAt || "";
  const narrative = params.narrative === undefined ? "" : params.narrative ? "1" : "0";
  return sha256(
    `chat-message-v5|${params.orgId}|${params.userId}|${params.profileUpdatedAt}|${txUpdatedAt}|${journalUpdatedAt}|${narrative}|${params.sessionId}|${params.sessionMessageCount}|${summaryUpdatedAt}|${params.content.trim()}`
  );
};

// Standard time-to-live expiration durations for various cached AI response categories.
// Assigns 6 hours for command processing responses and 30 minutes for chat dialogues.
// Regulates memory retention and cache eviction policies across caching models.
export const ttlMs = {
  processCommand: 6 * 60 * 60 * 1000,
  chatMessage: 30 * 60 * 1000
};
