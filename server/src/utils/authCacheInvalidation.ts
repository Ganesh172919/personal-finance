/**
 * Mongoose plugin that invalidates the request-path auth cache whenever a User
 * or OrgMember document is written, so role/org/password/status changes take
 * effect on the very next request instead of after the cache TTL.
 *
 * Apply BEFORE the model is compiled:
 *   userSchema.plugin(authCacheInvalidation, { source: "user" });
 *   orgMemberSchema.plugin(authCacheInvalidation, { source: "member" });
 *
 * Note: native driver writes (collection.* / bulkWrite) bypass Mongoose hooks;
 * the cache TTL bounds staleness for those.
 */
import type { Schema } from "mongoose";
import { authCacheTtlSeconds, invalidateAuthCache } from "../services/authCacheStore";

type Source = "user" | "member";

const QUERY_WRITE_HOOKS = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const;

const directId = (source: Source, filter: Record<string, unknown>) => {
  const value = source === "user" ? filter._id : filter.userId;
  if (value && (typeof value === "string" || typeof (value as any).toHexString === "function")) {
    return String(value);
  }
  return undefined;
};

export function authCacheInvalidation(schema: Schema, options: { source: Source }): void {
  const { source } = options;
  const idField = source === "user" ? "_id" : "userId";

  schema.post("save", function (doc: any) {
    void invalidateAuthCache(source === "user" ? doc?._id : doc?.userId);
  });

  schema.post("insertMany", function (docs: any) {
    for (const doc of Array.isArray(docs) ? docs : []) {
      void invalidateAuthCache(source === "user" ? doc?._id : doc?.userId);
    }
  });

  for (const hook of QUERY_WRITE_HOOKS) {
    // Resolve the affected user ids BEFORE the write (a filter on e.g. email or
    // membership _id does not name the user directly).
    schema.pre(hook as any, async function (this: any) {
      if (authCacheTtlSeconds() <= 0) return; // cache disabled: nothing to invalidate
      const filter = (this.getFilter?.() ?? {}) as Record<string, unknown>;
      const direct = directId(source, filter);
      if (direct) {
        this._authCacheIds = [direct];
        return;
      }
      try {
        const rows = await this.model.find(filter).select({ [idField]: 1 }).lean();
        this._authCacheIds = (rows as any[]).map(row => String(row[idField]));
      } catch {
        this._authCacheIds = [];
      }
    });

    schema.post(hook as any, async function (this: any) {
      const ids: string[] = this._authCacheIds ?? [];
      await Promise.all(ids.map(id => invalidateAuthCache(id)));
    });
  }
}
