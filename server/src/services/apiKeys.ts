import crypto from "crypto";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import ApiKeyModel, { type ApiKeyScope } from "../models/apiKeyModel";

// Retrieves cryptographic pepper secret from runtime environment settings.
// Falls back to the primary JWT secret if dedicated pepper is not configured.
// Provides additional secret key material for API key hashing operations.
const getPepper = () => {
  const env = getEnv();
  return env.API_KEY_PEPPER || env.JWT_SECRET;
};

// Produces a deterministic HMAC-SHA256 digest of a plaintext API secret key.
// Uses server-side pepper secret as the signing key to prevent dictionary attacks.
// Returns a hexadecimal string used for indexed database lookups and authentication.
export const hashApiKey = (raw: string) => {
  return crypto.createHmac("sha256", getPepper()).update(raw).digest("hex");
};

// Generates a cryptographically random prefixed API key credential.
// Constructs a human-readable prefix alongside high-entropy base64url random bytes.
// Computes and returns the key secret, public prefix, and storage hash digest.
export const generateApiKeySecret = () => {
  const prefix = `fwk_${crypto.randomBytes(4).toString("hex")}`;
  const secret = `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
  const keyHash = hashApiKey(secret);
  return {
    secret,
    keyPrefix: prefix,
    keyHash,
  };
};

// Persists a newly generated API key credential record for an organization.
// Assigns user ownership, authorization scopes, and cryptographic hash representation.
// Returns the plaintext secret once upon creation for initial client display.
export const createApiKey = async (params: {
  orgId: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;
  name: string;
  scopes: ApiKeyScope[];
}) => {
  const { secret, keyPrefix, keyHash } = generateApiKeySecret();

  const created = await ApiKeyModel.create({
    orgId: params.orgId,
    createdByUserId: params.createdByUserId,
    name: params.name,
    keyPrefix,
    keyHash,
    scopes: params.scopes,
  });

  return {
    id: created._id.toString(),
    secret,
    keyPrefix,
    scopes: created.scopes,
    createdAt: created.createdAt,
  };
};

// Resolves and authenticates an incoming raw API key against database records.
// Hashes the trimmed key token to query active, non-revoked matching records.
// Returns the persisted API key document if valid or null if not found.
export const resolveApiKey = async (rawKey: string) => {
  const normalized = String(rawKey || "").trim();
  if (!normalized) {
    return null;
  }

  const keyHash = hashApiKey(normalized);
  const key = await ApiKeyModel.findOne({ keyHash, revokedAt: { $exists: false } }).lean();
  return key;
};

