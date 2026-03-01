import { Schema, model, Document, Types } from "mongoose";

/**
 * MemoryRecord Model
 * Stores AI-learned facts about users across sessions.
 * Replaces the Python SQLite-based memory store with MongoDB for persistence.
 */
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

export interface IMemoryRecordDocument extends IMemoryRecord, Document {
  _id: Types.ObjectId;
}

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

// Compound indexes
memoryRecordSchema.index({ orgId: 1, userId: 1, key: 1 }, { unique: true });
memoryRecordSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });

// Text index for keyword search
memoryRecordSchema.index({ key: "text", value: "text" });

const MemoryRecordModel = model<IMemoryRecordDocument>("MemoryRecord", memoryRecordSchema);
export default MemoryRecordModel;
