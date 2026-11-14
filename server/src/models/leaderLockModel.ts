/**
 * @fileoverview Mongo fallback for leader election when Redis is unavailable (collection `leader_locks`).
 * One document per lock name; `expiresAt` is the lease deadline (TTL index cleans abandoned rows).
 */
import { Schema, model, Document } from "mongoose";

// Defines the attributes for distributed leader election lock records.
// Identifies unique lock names, current holding node instances, and lease expiration dates.
// Used as a MongoDB-backed failover mechanism when Redis clustering is offline.
export interface ILeaderLock {
  name: string;
  holder: string;
  expiresAt: Date;
}

// Merges the leader lock interface with Mongoose Document properties.
// Enables typed document manipulation, validation, and lifecycle hooks.
// Represents a persistent lock row in the MongoDB leader_locks collection.
export interface ILeaderLockDocument extends ILeaderLock, Document {}

// Configures the Mongoose schema for the leader election collection.
// Enforces unique lock names and non-nullable lease holder assignments.
// Targets the dedicated leader_locks collection explicitly without auto-pluralization.
const leaderLockSchema = new Schema<ILeaderLockDocument>(
  {
    name: { type: String, required: true, unique: true },
    holder: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "leader_locks" }
);

// Configures a MongoDB Time-To-Live (TTL) index on lease expiration timestamps.
// Automatically cleans up abandoned or timed-out lock entries after 3600 seconds.
// Guarantees distributed lock availability even if the holding instance crashes.
leaderLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

// Compiles and exports the Mongoose model for distributed leader lock instances.
// Provides atomic query-and-update capabilities for acquiring and extending leases.
// Essential for orchestrating singleton background jobs and cron workers.
const LeaderLockModel = model<ILeaderLockDocument>("LeaderLock", leaderLockSchema);
export default LeaderLockModel;
