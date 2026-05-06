/**
 * @fileoverview Two-Factor Authentication Controller (v1)
 *
 * TOTP-based two-factor authentication lifecycle: setup, verify, disable, status.
 * Uses a pending-secret pattern where the secret is generated during setup and
 * only persisted after the user successfully verifies a TOTP code.
 *
 * Routes served:
 *   POST /api/v1/auth/2fa/setup    - setup2FA (generates secret + QR URI)
 *   POST /api/v1/auth/2fa/verify   - verify2FA (confirms setup, generates backup codes)
 *   POST /api/v1/auth/2fa/disable  - disable2FA (requires TOTP or backup code)
 *   GET  /api/v1/auth/2fa/status   - get2FAStatus
 *
 * Key patterns:
 *   - Two-phase setup: generate secret -> verify token -> activate
 *   - Pending secret stored temporarily; moved to permanent field on verify
 *   - Backup codes generated as plaintext, stored as hashes
 *   - Disable requires valid TOTP token OR backup code (fallback authentication)
 *   - Audit events recorded for enable, disable, and failed attempts
 *
 * @module controllers/v1/twoFactorController
 */

import type { Request, Response } from "express";
import {
  generateTotpSecret,
  generateTotpUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
} from "../../services/totp";
import { auditFromRequest } from "../../services/auditService";
import UserModel from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

/**
 * POST /api/v1/auth/2fa/setup
 * Generate a TOTP secret and return the QR URI (user must verify before it's saved).
 */
export const setup2FA = async (req: Request, res: Response) => {
  const userId = (req as any).user?._id;
  if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  const user = await UserModel.findById(userId).select("email twoFactorEnabled").lean();
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  if ((user as any).twoFactorEnabled) {
    throw new HttpError(409, "ALREADY_ENABLED", "Two-factor authentication is already enabled");
  }

  const secret = generateTotpSecret();
  const uri = generateTotpUri(secret, user.email);

  // Store secret temporarily in a separate field; it only moves to the permanent
  // twoFactorSecret field after the user successfully verifies a TOTP code
  await UserModel.updateOne(
    { _id: userId },
    { $set: { twoFactorPendingSecret: secret } },
  );

  res.json({
    secret,
    uri,
    message: "Scan the QR code with your authenticator app, then verify with a token.",
    request_id: req.requestId,
  });
};

/**
 * POST /api/v1/auth/2fa/verify
 * Verify a TOTP token against the pending secret to confirm 2FA setup.
 * Body: { token: "123456" }
 */
export const verify2FA = async (req: Request, res: Response) => {
  const userId = (req as any).user?._id;
  if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    throw new HttpError(400, "INVALID_TOKEN", "A 6-digit TOTP token is required");
  }

  const user = await UserModel.findById(userId).select("twoFactorPendingSecret twoFactorEnabled").lean();
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const pendingSecret = (user as any).twoFactorPendingSecret;
  if (!pendingSecret) {
    throw new HttpError(400, "NO_PENDING_SECRET", "No pending 2FA setup. Call /2fa/setup first.");
  }

  const result = verifyTotp(token, pendingSecret);
  if (!result.valid) {
    auditFromRequest(req, "2fa_failed", { metadata: { phase: "setup_verify" } });
    throw new HttpError(400, "INVALID_TOKEN", "Token verification failed. Check your authenticator app clock.");
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes(8);
  const hashedCodes = backupCodes.map(hashBackupCode);

  // Activate 2FA
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        twoFactorEnabled: true,
        twoFactorSecret: pendingSecret,
        twoFactorBackupCodes: hashedCodes,
      },
      $unset: { twoFactorPendingSecret: 1 },
    },
  );

  auditFromRequest(req, "2fa_enabled");

  res.json({
    enabled: true,
    backup_codes: backupCodes,
    message: "2FA is now active. Save your backup codes in a secure location — they will not be shown again.",
    request_id: req.requestId,
  });
};

/**
 * POST /api/v1/auth/2fa/disable
 * Disable 2FA — requires a valid TOTP token or backup code.
 * Body: { token: "123456" }
 */
export const disable2FA = async (req: Request, res: Response) => {
  const userId = (req as any).user?._id;
  if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    throw new HttpError(400, "INVALID_TOKEN", "A TOTP token or backup code is required");
  }

  const user = await UserModel.findById(userId).select("twoFactorEnabled twoFactorSecret twoFactorBackupCodes").lean();
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  if (!(user as any).twoFactorEnabled) {
    throw new HttpError(400, "NOT_ENABLED", "Two-factor authentication is not enabled");
  }

  const secret = (user as any).twoFactorSecret;
  const totpResult = verifyTotp(token, secret);

  if (!totpResult.valid) {
    // TOTP failed — try the token as a backup code (hashed comparison)
    const hashedInput = hashBackupCode(token);
    const backupCodes: string[] = (user as any).twoFactorBackupCodes || [];
    if (!backupCodes.includes(hashedInput)) {
      auditFromRequest(req, "2fa_failed", { metadata: { phase: "disable" } });
      throw new HttpError(400, "INVALID_TOKEN", "Invalid token or backup code");
    }
  }

  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { twoFactorEnabled: false },
      $unset: {
        twoFactorSecret: 1,
        twoFactorPendingSecret: 1,
        twoFactorBackupCodes: 1,
      },
    },
  );

  auditFromRequest(req, "2fa_disabled");

  res.json({
    enabled: false,
    message: "Two-factor authentication has been disabled.",
    request_id: req.requestId,
  });
};

/**
 * GET /api/v1/auth/2fa/status
 * Check if 2FA is enabled for the current user.
 */
export const get2FAStatus = async (req: Request, res: Response) => {
  const userId = (req as any).user?._id;
  if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  const user = await UserModel.findById(userId).select("twoFactorEnabled").lean();

  res.json({
    enabled: !!(user as any)?.twoFactorEnabled,
    request_id: req.requestId,
  });
};
