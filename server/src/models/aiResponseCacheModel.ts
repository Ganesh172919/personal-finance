import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript interface for cached AI model inference responses.
// Stores serialized payload, originating endpoint, and cache expiration time.
// Prevents duplicate expensive model queries for identical prompt invocations.
export interface IAiResponseCache {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  cacheKey: string;
  endpoint: string;
  responseData: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

// Extends IAiResponseCache with Mongoose Document properties and ObjectId.
// Enables runtime document persistence and strongly typed MongoDB querying.
// Represents individual cache records inside MongoDB storage collection.
export interface IAiResponseCacheDocument extends IAiResponseCache, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition for storing cached AI query results.
// Enforces unique cacheKey constraint and binds cache entries to tenant org.
// Tracks creation and modification timestamps automatically via schema options.
const aiResponseCacheSchema = new Schema<IAiResponseCacheDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cacheKey: { type: String, required: true, unique: true },
    endpoint: { type: String, required: true },
    responseData: { type: Schema.Types.Mixed, required: true, default: {} },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// Configures automated TTL document expiration and tenant lookup indexes.
// Deletes expired cache entries automatically when expiresAt timestamp passes.
// Optimizes user and organization cache query operations across collections.
aiResponseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
aiResponseCacheSchema.index({ orgId: 1, userId: 1, createdAt: -1 });

// Instantiates Mongoose model bound to MongoDB "AiResponseCache" collection.
// Provides strongly typed querying, cache retrieval, and cache storage.
// Used by AI proxy services and controllers for fast response caching.
const AiResponseCacheModel = model<IAiResponseCacheDocument>("AiResponseCache", aiResponseCacheSchema);
// Exports compiled AiResponseCacheModel instance as default module export.
// Imported by response cache stores and AI controller caching middleware.
// Provides central data access point for managing AI inference cache records.
export default AiResponseCacheModel;
