/**
 * Two-Factor Authentication (TOTP)
 *
 * Provides TOTP (Time-based One-Time Password) generation and verification
 * using the standard RFC 6238 algorithm. Uses native Node.js crypto —
 * no external TOTP library required.
 *
 * Flow:
 *   1. User enables 2FA → generate secret → show QR code URI
 *   2. User enters TOTP from authenticator app → verify + store secret
 *   3. On login, if 2FA enabled → require TOTP after password check
 */

import crypto from "crypto";

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // seconds
const TOTP_ALGORITHM = "sha1";
const TOTP_ISSUER = "Personal Finance";

/**
 * Generate a random TOTP secret (base32 encoded).
 */
export function generateTotpSecret(length: number = 20): string {
  const buffer = crypto.randomBytes(length);
  return base32Encode(buffer);
}

/**
 * Generate the otpauth:// URI for QR code scanning.
 */
export function generateTotpUri(
  secret: string,
  userEmail: string,
  issuer: string = TOTP_ISSUER,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(userEmail);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Verify a TOTP token against a secret.
 * Allows a window of ±1 period to account for clock drift.
 */
export function verifyTotp(
  token: string,
  secret: string,
  windowSize: number = 1,
): { valid: boolean; drift: number } {
  const normalizedToken = token.replace(/\s+/g, "").trim();

  if (normalizedToken.length !== TOTP_DIGITS || !/^\d+$/.test(normalizedToken)) {
    return { valid: false, drift: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const secretBuffer = base32Decode(secret);

  for (let i = -windowSize; i <= windowSize; i++) {
    const counter = Math.floor((now + i * TOTP_PERIOD) / TOTP_PERIOD);
    const expectedToken = generateHotp(secretBuffer, counter);

    if (timingSafeCompare(normalizedToken, expectedToken)) {
      return { valid: true, drift: i };
    }
  }

  return { valid: false, drift: 0 };
}

/**
 * Generate a current TOTP token (for testing/debugging only).
 */
export function generateCurrentTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  return generateHotp(base32Decode(secret), counter);
}

/**
 * Generate backup codes — single-use recovery codes for 2FA.
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX (8 alphanumeric characters)
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/**
 * Hash backup codes for storage (don't store plaintext).
 */
export function hashBackupCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code.replace(/[-\s]/g, "").toUpperCase())
    .digest("hex");
}

// ─── Internal Helpers ────────────────────────────────────

function generateHotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff;
    counter = counter >> 8;
  }

  const hmac = crypto.createHmac(TOTP_ALGORITHM, secret);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, "0");
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Base32 ──────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

function base32Decode(encoded: string): Buffer {
  const stripped = encoded.replace(/[=\s]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of stripped) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
