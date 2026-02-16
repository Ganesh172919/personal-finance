import { Schema, model, Document, Types } from "mongoose";

export interface IAiResponseCache {
  userId: Types.ObjectId;
  cacheKey: string;
  endpoint: string;
  responseData: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

export interface IAiResponseCacheDocument extends IAiResponseCache, Document {
  _id: Types.ObjectId;
}

const aiResponseCacheSchema = new Schema<IAiResponseCacheDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cacheKey: { type: String, required: true, unique: true, index: true },
    endpoint: { type: String, required: true },
    responseData: { type: Schema.Types.Mixed, required: true, default: {} },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

aiResponseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiResponseCacheModel = model<IAiResponseCacheDocument>("AiResponseCache", aiResponseCacheSchema);
export default AiResponseCacheModel;

