import { Schema, model, Document, Types } from "mongoose";

/**
 * MemoryRecord Model
 * Stores AI-learned facts about users across sessions.
 * Replaces the Python SQLite-based memory store with MongoDB for persistence.
 */
// Defines the explicit index identifier name for tenant-scoped memory text searches.
// Used during startup migrations to idempotently replace legacy unpartitioned text indexes.
// Ensures uniform naming across database schema definitions and migration scripts.
export const MEMORY_TEXT_INDEX_NAME = "memory_org_text";

// Defines the data attributes for AI-learned facts and user memory records.
// Encapsulates key-value memory pairs, extraction confidence scores, and origin provenance.
// Serves as persistent episodic memory used to personalize conversational assistance.
export interface IMemoryRecord {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

// Merges memory record attributes with standard Mongoose Document properties.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent memory entry returned by semantic retrieval queries.
export interface IMemoryRecordDocument extends IMemoryRecord, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for the AI agent persistent memory collection.
// Enforces validation rules on memory keys, value lengths, and confidence ranges.
// Manages automated document creation and modification timestamps on all write operations.
const memoryRecordSchema = new Schema<IMemoryRecordDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0.5,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "ai_conversation",
    },
  },
  { timestamps: true },
);

// Establishes compound indexes to enforce memory uniqueness and accelerate lookups.
// Guarantees one unique value per memory key within an organization and user scope.
// Optimizes chronological ordering for fetching recently updated user context.
// Compound indexes
memoryRecordSchema.index({ orgId: 1, userId: 1, key: 1 }, { unique: true });
memoryRecordSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });

// Configures an organization-scoped compound full-text index on keys and values.
// Enables keyword-based fuzzy search across memories while enforcing strict tenant boundaries.
// Replaced dynamically at server boot by database migration utilities when needed.
// Text index for keyword search, tenant-scoped: MongoDB allows ONE text index per
// collection, so it carries an orgId prefix (equality-scoped text queries must
// include orgId). Existing deployments hold the old unscoped { key, value } text
// index; services/dbMigrations.ts replaces it at startup (idempotent).
memoryRecordSchema.index({ orgId: 1, key: "text", value: "text" }, { name: MEMORY_TEXT_INDEX_NAME });

// Compiles and exports the Mongoose model for AI persistent memory records.
// Provides data access methods to store, retrieve, update, and search conversational facts.
// Connects the AI orchestration engine to MongoDB for cross-session knowledge retention.
const MemoryRecordModel = model<IMemoryRecordDocument>("MemoryRecord", memoryRecordSchema);
export default MemoryRecordModel;
