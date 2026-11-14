/**
 * @fileoverview Request-path auth cache: lean user + active org memberships.
 *
 * Provides optional user/membership caching for non-authorization callers.
 * JWT verification always fetches current MFA enrollment and the request edge
 * always fetches current memberships from MongoDB: local/Redis cache invalidation
 * cannot guarantee timely authorization changes across replicas. Other cached
 * reads are invalidated by model hooks (utils/authCacheInvalidation).
 * Logout clears cookies; it does not revoke already issued JWTs.
 *
 * When the cache is disabled (AUTH_CACHE_TTL_SECONDS=0, the default in tests) the
 * functions fall through to plain queries, preserving the original behaviour.
 */
import mongoose from "mongoose";

import OrgMemberModel, { type OrgRole } from "../models/orgMemberModel";
import UserModel, { type IUserDocument } from "../models/userModel";
import { authCacheGet, authCacheSet, authCacheTtlSeconds, invalidateAuthCache } from "./authCacheStore";

export { invalidateAuthCache };

// Represents a lightweight, serializable organization membership record.
// Stores essential authorization details including role, default status, and timestamps.
// Optimized for quick caching and edge validation without full database queries.
export interface CachedMembership {
  _id: string;
  orgId: string;
  role: OrgRole;
  isDefault: boolean;
  createdAt: string;
}

const inflight = new Map<string, Promise<unknown>>();

// Deduplicates concurrent in-flight data fetching promises for identical cache keys.
// Ensures expensive database read operations execute only once per concurrent wave.
// Cleans up internal promise tracking automatically upon resolution or rejection.
const singleflight = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = load().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
};

/** Loads the user for a verified JWT payload id. Returns null when the user no longer exists. */
// Resolves an authenticated user document by ID leveraging the multi-tier auth cache.
// Bypasses cache when fresh data is explicitly demanded or caching is disabled.
// Hydrates raw cached JSON into a fully functional Mongoose user document instance.
export const getAuthUser = async (userId: string, options: { fresh?: boolean } = {}): Promise<IUserDocument | null> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

  // MFA enrollment is an authorization change. Other replicas may still have
  // a cached pre-enrollment user: always consult MongoDB before accepting a JWT.
  if (options.fresh || authCacheTtlSeconds() <= 0) {
    return UserModel.findById(userId);
  }

  const cached = await authCacheGet("u", userId);
  if (cached) {
    // Parse per hit so callers can never mutate the shared cached copy.
    return UserModel.hydrate(JSON.parse(cached)) as IUserDocument;
  }

  const json = await singleflight(`u:${userId}`, async () => {
    const lean = await UserModel.findById(userId).lean();
    if (!lean) return null;
    const serialized = JSON.stringify(lean);
    await authCacheSet("u", userId, serialized);
    return serialized;
  });
  return json ? (UserModel.hydrate(JSON.parse(json)) as IUserDocument) : null;
};

// Transforms a raw MongoDB membership document into a standardized cached structure.
// Coerces identifier types and timestamps into predictable string formats.
// Strips superfluous document fields to optimize memory and serialized payload footprint.
const toCachedMembership = (row: any): CachedMembership => ({
  _id: String(row._id),
  orgId: String(row.orgId),
  role: row.role as OrgRole,
  isDefault: Boolean(row.isDefault),
  createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
});

/** Active memberships for a user, oldest first (one read replaces up to three). */
// Retrieves all active organization memberships for a specified user ID.
// Utilizes caching and singleflight coalescing to eliminate duplicate read load.
// Enforces direct database querying when fresh edge authorization is required.
export const getAuthMemberships = async (
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<CachedMembership[]> => {
  // Authorization at the HTTP edge must not trust a process-local cache after
  // another replica revokes membership or downgrades a role. Bypass both tiers
  // and singleflight, which could have begun before the revocation committed.
  if (options.fresh) {
    const rows = await OrgMemberModel.find({ userId: new mongoose.Types.ObjectId(userId), status: "active" })
      .select({ orgId: 1, role: 1, isDefault: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .lean();
    return (rows as any[]).map(toCachedMembership);
  }

  if (authCacheTtlSeconds() > 0) {
    const cached = await authCacheGet("m", userId);
    if (cached) return JSON.parse(cached) as CachedMembership[];
  }

  return singleflight(`m:${userId}`, async () => {
    const rows = await OrgMemberModel.find({ userId: new mongoose.Types.ObjectId(userId), status: "active" })
      .select({ orgId: 1, role: 1, isDefault: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .lean();
    const memberships = (rows as any[]).map(toCachedMembership);
    // Only cache non-empty results: an empty list means the personal org is about
    // to be created and must be re-read afterwards.
    if (memberships.length > 0) await authCacheSet("m", userId, JSON.stringify(memberships));
    return memberships;
  });
};

/** Same selection rule as orgService.resolveDefaultOrgForUser: explicit default first, else oldest. */
// Resolves the primary organization membership from an array of cached memberships.
// Prioritizes explicitly marked default memberships and falls back to the oldest record.
// Mirrors organization selection logic consistently across request validation flows.
export const pickDefaultMembership = (memberships: CachedMembership[]): CachedMembership | undefined =>
  memberships.find(member => member.isDefault) ?? memberships[0];
