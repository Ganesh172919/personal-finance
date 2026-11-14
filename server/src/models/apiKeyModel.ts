import { Schema, model, Document, Types } from "mongoose";

// Enumerates permission scopes available for programmatic API key access.
// Controls granular read and write privileges over workflows and ledgers.
// Enforced by authorization middleware during API key bearer authentication.
export type ApiKeyScope =
  | "usage:read"
  | "workflows:read"
  | "workflows:write"
  | "transactions:read"
  | "transactions:write";

// Defines TypeScript contract representing an organization API key record.
// Stores hashed secret, public key prefix, assigned permission scopes, and audit dates.
// Prevents plain-text key exposure by persisting only SHA-256 cryptographic hashes.
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

// Extends IApiKey with Mongoose Document methods and MongoDB identifier.
// Enables runtime database querying, persistence, and validation logic.
// Represents strongly typed API key records in MongoDB storage layer.
export interface IApiKeyDocument extends IApiKey, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition for programmatic API keys and access tokens.
// Enforces unique keyHash indexing, max string lengths, and tenant relationships.
// Enables automatic tracking of createdAt and updatedAt timestamps for auditing.
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

// Compound indexes optimizing organizational API key listings and revocations.
// Speeds up retrieval of active keys and facilitates chronological auditing.
// Ensures performant queries when validating key prefixes and expiration states.
apiKeySchema.index({ orgId: 1, createdAt: -1 });
apiKeySchema.index({ orgId: 1, revokedAt: 1, createdAt: -1 });

// Instantiates Mongoose model bound to the "ApiKey" database collection.
// Provides strongly typed CRUD operations for issuing and managing keys.
// Serves as data access layer for API key authentication middleware.
const ApiKeyModel = model<IApiKeyDocument>("ApiKey", apiKeySchema);
// Exports compiled ApiKeyModel instance as default module export.
// Imported by authentication controllers, key generation routines, and middleware.
// Provides centralized interface for API token verification and revocation.
export default ApiKeyModel;
