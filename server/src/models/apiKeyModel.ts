import { Schema, model, Document, Types } from "mongoose";

export type ApiKeyScope =
  | "usage:read"
  | "workflows:read"
  | "workflows:write"
  | "transactions:read"
  | "transactions:write";

export interface IApiKey {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApiKeyDocument extends IApiKey, Document {
  _id: Types.ObjectId;
}

const apiKeySchema = new Schema<IApiKeyDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    keyPrefix: { type: String, required: true, trim: true, maxlength: 32, index: true },
    keyHash: { type: String, required: true, trim: true, maxlength: 128, unique: true },
    scopes: { type: [String], default: [], required: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

apiKeySchema.index({ orgId: 1, createdAt: -1 });
apiKeySchema.index({ orgId: 1, revokedAt: 1, createdAt: -1 });

const ApiKeyModel = model<IApiKeyDocument>("ApiKey", apiKeySchema);
export default ApiKeyModel;
