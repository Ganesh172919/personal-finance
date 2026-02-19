import crypto from "crypto";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import ApiKeyModel, { type ApiKeyScope } from "../models/apiKeyModel";

const getPepper = () => {
  const env = getEnv();
  return env.API_KEY_PEPPER || env.JWT_SECRET;
};

export const hashApiKey = (raw: string) => {
  return crypto.createHmac("sha256", getPepper()).update(raw).digest("hex");
};

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

export const resolveApiKey = async (rawKey: string) => {
  const normalized = String(rawKey || "").trim();
  if (!normalized) {
    return null;
  }

  const keyHash = hashApiKey(normalized);
  const key = await ApiKeyModel.findOne({ keyHash, revokedAt: { $exists: false } }).lean();
  return key;
};

