import crypto from "node:crypto";

import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";

const PREFIX = "v1";

// Resolves and validates the 32-byte AES-256 webhook encryption secret key.
// Decodes key material from base64 representation configured in environment settings.
// Throws a 503 HTTP error if key configuration is absent or contains invalid byte lengths.
const getEncryptionKey = () => {
  const encoded = getEnv().WEBHOOK_CREDENTIALS_KEY;
  if (!encoded) {
    throw new HttpError(
      503,
      "WEBHOOK_CREDENTIALS_NOT_CONFIGURED",
      "Saved webhook authorization requires WEBHOOK_CREDENTIALS_KEY to be configured.",
    );
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new HttpError(
      503,
      "WEBHOOK_CREDENTIALS_NOT_CONFIGURED",
      "WEBHOOK_CREDENTIALS_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
};

/** Encrypt a scheduled webhook authorization value using AES-256-GCM. */
// Encrypts sensitive outbound webhook credentials using the AES-256-GCM cipher.
// Generates a random 12-byte initialization vector and captures authentication tags.
// Serializes ciphertext, tag, and initialization vector into a dot-delimited string.
export const encryptWebhookCredential = (plaintext: string) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
};

/** Decrypt a stored credential; deliberately refuse unsafe legacy plaintext. */
// Decrypts authenticated AES-256-GCM ciphertext strings back into plaintext credentials.
// Verifies format versions and rejects unencrypted legacy credentials or corrupted tags.
// Enforces cryptographic rotation errors when decryption fails or format is invalid.
export const decryptWebhookCredential = (stored: string) => {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, ...extra] = stored.split(".");
  if (version !== PREFIX || !ivEncoded || !tagEncoded || !ciphertextEncoded || extra.length > 0) {
    throw new HttpError(
      409,
      "WEBHOOK_CREDENTIAL_REQUIRES_ROTATION",
      "This webhook authorization must be replaced before it can be used.",
    );
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, "WEBHOOK_CREDENTIAL_REQUIRES_ROTATION", "This webhook authorization must be replaced before it can be used.");
  }
};
