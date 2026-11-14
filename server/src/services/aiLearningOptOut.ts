/**
 * @fileoverview Per-org opt-out from the AI learning loop (privacy).
 *
 * `Organization.aiLearningOptOut` (default false) stops the gateway forwarding
 * feedback to AI Core, and makes every AI process call carry
 * `X-Internal-Learning-Opt-Out: 1` so AI Core does not store traces for the run.
 *
 * `aiCoreActorHeaders` is synchronous, so the opt-out flag is kept in a small
 * in-process cache for callers without a request-local lookup. AI process and
 * stream calls use a fresh `primeLearningOptOut` result to override that cache;
 * on DB failure they fail closed and tell AI Core not to store learning traces.
 * The lookup never blocks on a disconnected DB.
 *
 * Learning-data deletion: the gateway has no account-delete / data-export pipeline to hook
 * into yet. When one exists it should (a) delete the user's AgentOutput feedback fields
 * (`feedback`, `reviewStatus`) and (b) call AI Core's learning-data purge for the org/user.
 * Until then, opting the org out stops all further forwarding and trace storage.
 */
import mongoose from "mongoose";

import OrganizationModel from "../models/organizationModel";

// Standard HTTP header key signaling that an organization has opted out of AI model training.
// Propagated to AI Core to instruct agents not to persist runtime training traces.
// Enforces compliance with tenant data privacy and model training preferences.
export const LEARNING_OPT_OUT_HEADER = "X-Internal-Learning-Opt-Out";

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

// Cache entry tracking organization learning opt-out status alongside timestamp expiration.
// Stores a boolean flag reflecting opt-out state and numeric epoch milliseconds for expiry.
// Managed by the in-process cache map to provide non-blocking synchronous lookups.
type Entry = { optedOut: boolean; expiresAt: number };
const cache = new Map<string, Entry>();

// Stores an organization's learning opt-out preference in the in-memory cache with an expiry TTL.
// Evicts the oldest cached key when the cache size reaches the maximum allowed entries.
// Ensures fast synchronous reads without querying the database on every outbound request.
const remember = (orgId: string, optedOut: boolean, ttlMs = TTL_MS) => {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(orgId, { optedOut, expiresAt: Date.now() + ttlMs });
};

// Validates and normalizes candidate organization IDs into a 24-character hexadecimal string.
// Trims surrounding whitespace and checks format against standard MongoDB ObjectId regex.
// Returns a clean string if valid, or an empty string if malformed or unrecognized.
const normalizeOrgId = (orgId: unknown): string => {
  const value = typeof orgId === "string" ? orgId.trim() : orgId ? String(orgId) : "";
  return /^[a-f\d]{24}$/i.test(value) ? value : "";
};

/** Synchronous read of the cached flag (false when unknown or expired). */
// Synchronously checks whether an organization has an active learning opt-out cached in memory.
// Validates cache presence and ensures the cached entry has not exceeded its expiration TTL.
// Returns false if the organization is unknown, expired, or actively opted in.
export const isLearningOptOutCached = (orgId: unknown): boolean => {
  const key = normalizeOrgId(orgId);
  if (!key) return false;
  const entry = cache.get(key);
  return Boolean(entry && entry.expiresAt > Date.now() && entry.optedOut);
};

/** Loads (and caches) the org's flag. Never throws; failClosed returns true on lookup failure. */
// Asynchronously fetches and caches an organization's AI learning opt-out flag from the database.
// Supports force-refresh overrides and fails closed to protect privacy if the database is unreachable.
// Returns a boolean indicating whether the organization is currently opted out of learning.
export const primeLearningOptOut = async (
  orgId: unknown,
  options: { forceRefresh?: boolean; failClosed?: boolean } = {}
): Promise<boolean> => {
  const key = normalizeOrgId(orgId);
  if (!key) return Boolean(options.failClosed);
  const entry = cache.get(key);
  if (!options.forceRefresh && entry && entry.expiresAt > Date.now()) return entry.optedOut;
  // A disconnected mongoose buffers queries for seconds; never stall an AI call on that.
  if (mongoose.connection.readyState !== 1) return Boolean(options.failClosed);
  try {
    const org = await OrganizationModel.findById(key).select({ aiLearningOptOut: 1 }).lean();
    if (!org && options.failClosed) return true;
    const optedOut = Boolean((org as any)?.aiLearningOptOut);
    remember(key, optedOut);
    return optedOut;
  } catch {
    if (!options.failClosed) remember(key, false, 5_000);
    return Boolean(options.failClosed);
  }
};

/** Call after the setting changes so every process sees the new value immediately. */
// Updates the cached learning opt-out status for an organization immediately across this process.
// Called by organization settings controllers when privacy configurations are toggled.
// Eliminates cache staleness and ensures instantaneous enforcement of privacy choices.
export const setLearningOptOutCached = (orgId: unknown, optedOut: boolean) => {
  const key = normalizeOrgId(orgId);
  if (key) remember(key, optedOut);
};

// Testing utility that clears all cached organization learning opt-out entries.
// Resets the internal cache map between test suites to prevent state leakage.
// Intended exclusively for automated testing and test environment teardown.
export const __resetLearningOptOutCacheForTests = () => cache.clear();
