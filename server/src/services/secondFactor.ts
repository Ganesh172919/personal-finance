import crypto from "crypto";
import UserModel from "../models/userModel";
import { hashBackupCode, verifyTotp } from "./totp";

/** Atomically consumes a TOTP time step or a recovery code across API replicas. */
// Atomically verifies and consumes a two-factor authentication code or backup token.
// Enforces replay prevention by verifying against monotonically increasing time counters.
// Pulls used recovery backup codes atomically to ensure single-use authorization.
export async function consumeSecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await UserModel.findOne({ _id: userId, twoFactorEnabled: true })
    .select("+twoFactorSecret").lean();
  if (!user?.twoFactorSecret) return false;

  const result = verifyTotp(code, user.twoFactorSecret);
  if (result.valid) {
    const counter = Math.floor(Date.now() / 30_000) + result.drift;
    const consumed = await UserModel.updateOne(
      { _id: userId, twoFactorEnabled: true, twoFactorSecret: user.twoFactorSecret,
        $or: [{ twoFactorLastCounter: { $exists: false } }, { twoFactorLastCounter: { $lt: counter } }] },
      { $set: { twoFactorLastCounter: counter } },
    );
    return consumed.modifiedCount === 1;
  }

  if (!/^[a-fA-F0-9]{4}-?[a-fA-F0-9]{4}$/.test(code)) return false;
  const consumed = await UserModel.updateOne(
    { _id: userId, twoFactorEnabled: true, twoFactorBackupCodes: hashBackupCode(code) },
    { $pull: { twoFactorBackupCodes: hashBackupCode(code) } },
  );
  return consumed.modifiedCount === 1;
}

// Hashes an authentication challenge nonce using the SHA-256 algorithm.
// Produces a hexadecimal cryptographic digest for secure comparison.
// Prevents plaintext leakage of challenge nonces across auth handshakes.
export const hashChallenge = (nonce: string) => crypto.createHash("sha256").update(nonce).digest("hex");
