/**
 * @fileoverview Google OAuth 2.0 helpers (server-side authorization-code flow).
 *
 * Responsibilities:
 *  - Decide whether Google sign-in is enabled (credentials present AND strategy registered).
 *  - Derive the OAuth callback URL (GOOGLE_CALLBACK_URL, else `${CLIENT_URL origin}/api/auth/google/callback`).
 *  - Provide a cookie-backed state + PKCE store for passport-oauth2, so no server-side session is needed.
 *    The store writes a short-lived (10 min), HMAC-signed, httpOnly cookie holding the state nonce, the PKCE
 *    code verifier and the (sanitised) post-login destination / referral code. The callback is rejected
 *    unless the `state` query parameter matches the nonce inside that cookie.
 *  - Resolve a Google profile to a FinWise user (find / link / create) with the safety rules below.
 *
 * Safety rules:
 *  - The Google e-mail must be verified (`email_verified`) before an account is linked or created.
 *  - An existing e-mail+password account is only linked after verified-email proof from Google. If that
 *    account was never e-mail-verified (possible pre-registration squat), its password and pending OTP are
 *    removed on link so whoever squatted it cannot keep signing in.
 *  - An account already bound to a different Google id is never re-linked.
 *  - Redirect targets are fixed to CLIENT_URL (+ a sanitised relative path). No tokens or profile PII are logged.
 */
import crypto from "crypto";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import UserModel, { type IUserDocument } from "../models/userModel";
import { ensurePersonalOrgForUser } from "./orgService";

// Name of the signed HTTP-only cookie tracking Google OAuth state.
// Preserves the verification nonce and return redirection path.
// Safeguards client authorization across cross-site OAuth handshakes.
export const GOOGLE_STATE_COOKIE = "fw_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;
const STATE_AUDIENCE = "finwise:google-oauth-state";

/** Error codes surfaced to the client as `/login?error=<code>`. Fixed set: never reflect user input. */
// Enumerates standardized error codes for Google authentication failures.
// Maps internal OAuth verification errors to safe client-facing identifiers.
// Prevents reflection of sensitive backend error strings to the browser.
export type GoogleAuthErrorCode =
  | "google_unverified_email"
  | "google_no_email"
  | "google_account_conflict"
  | "google_state_invalid"
  | "google_denied"
  | "google_failed";

// List of all permitted Google authentication error codes.
// Provides runtime validation against unrecognized client error queries.
// Ensures strict type fidelity for OAuth failure handling flows.
export const GOOGLE_ERROR_CODES: readonly GoogleAuthErrorCode[] = [
  "google_unverified_email",
  "google_no_email",
  "google_account_conflict",
  "google_state_invalid",
  "google_denied",
  "google_failed",
];

// Context parameters preserved through the Google OAuth authorization flow.
// Captures post-login destination URL and optional referral codes.
// Enables seamless client redirection and attribution after sign-in.
export interface GoogleOAuthContext {
  next?: string;
  ref?: string;
}

// Checks whether Google OAuth environment variables are present.
// Validates client identifier and secret keys in the environment.
// Returns a boolean indicating if Google integration is viable.
export const isGoogleConfigured = (): boolean => {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
};

/** True when credentials are configured AND the strategy was registered by configurePassport(). */
// Verifies whether Google OAuth is both configured and registered.
// Checks passport strategy registration to ensure active readiness.
// Prevents initiation of OAuth flows when the strategy is inactive.
export const isGoogleOAuthEnabled = (): boolean => {
  if (!isGoogleConfigured()) return false;
  try {
    return Boolean((passport as any)._strategy?.("google"));
  } catch {
    return false;
  }
};

// Resolves the fully-qualified redirect URI for Google OAuth callbacks.
// Prefers explicit configuration or derives from the client origin.
// Guarantees consistent callback endpoints across routing topologies.
export const getGoogleCallbackUrl = (): string => {
  const env = getEnv();
  if (env.GOOGLE_CALLBACK_URL) return env.GOOGLE_CALLBACK_URL;
  // The SPA origin proxies /api to the gateway in every supported topology (Vite dev proxy, nginx, ALB).
  const origin = new URL(env.CLIENT_URL).origin;
  return `${origin}/api/auth/google/callback`;
};

// Retrieves the base URL for the client application stripped of slashes.
// Normalizes origin formatting for consistent redirect construction.
// Used as the base destination for post-authorization redirects.
export const getClientBaseUrl = (): string => getEnv().CLIENT_URL.replace(/\/+$/, "");

/** Same rules as the client's sanitizeNextPath: same-origin relative paths only. */
// Sanitizes redirect target paths to prevent open redirect vulnerabilities.
// Enforces relative path formats restricted to the same origin.
// Discards malicious protocols, backslashes, and malformed path strings.
export const sanitizeNextPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  if (trimmed.includes("://") || /[\\\r\n]/.test(trimmed)) return undefined;
  return trimmed;
};

// Cleanses and validates user referral codes from incoming query strings.
// Enforces alphanumeric character formats and strict length limits.
// Returns normalized uppercase strings or undefined for invalid inputs.
const sanitizeRef = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(cleaned) ? cleaned : undefined;
};

// Derives an HMAC key for cryptographic signing of OAuth state tokens.
// Couples system JWT secret with a dedicated state audience namespace.
// Guarantees tamper-proof state verification across external redirects.
const stateSigningKey = (): Buffer =>
  crypto.createHmac("sha256", getEnv().JWT_SECRET).update(STATE_AUDIENCE).digest();

// Configures cookie flags for storing transient OAuth state tokens.
// Sets secure, httpOnly, and lax same-site policies for redirect compatibility.
// Scopes cookie accessibility to the API route prefix for security.
const stateCookieOptions = () => {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Must be lax: the cookie has to accompany the top-level GET redirect coming back from Google.
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN,
    path: "/api",
  };
};

// Performs constant-time string comparison to prevent timing attacks.
// Converts string values into byte buffers for uniform comparison.
// Returns true only when byte lengths and contents match identically.
const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * passport-oauth2 state store (PKCE flavour, arity 5 / 3) backed by a signed cookie instead of a session.
 */
// Custom passport state store using signed cookies rather than server sessions.
// Issues signed JWTs containing nonces and PKCE verifiers to the client.
// Validates callback state against cookies and consumes tokens on verification.
export const googleStateStore = {
  store(
    req: Request,
    verifier: string,
    _state: unknown,
    _meta: unknown,
    callback: (err: Error | null, state?: string) => void,
  ) {
    try {
      const nonce = crypto.randomBytes(24).toString("base64url");
      const token = jwt.sign(
        {
          n: nonce,
          v: verifier,
          next: sanitizeNextPath(req.query?.next),
          ref: sanitizeRef(req.query?.ref),
        },
        stateSigningKey(),
        { expiresIn: STATE_TTL_SECONDS, audience: STATE_AUDIENCE },
      );
      req.res!.cookie(GOOGLE_STATE_COOKIE, token, { ...stateCookieOptions(), maxAge: STATE_TTL_SECONDS * 1000 });
      callback(null, nonce);
    } catch (err) {
      callback(err as Error);
    }
  },

  verify(
    req: Request,
    providedState: string | undefined,
    callback: (err: Error | null, ok?: string | false, info?: unknown) => void,
  ) {
    const fail = (message: string) => callback(null, false, { message, code: "google_state_invalid" });
    const raw = (req as any).cookies?.[GOOGLE_STATE_COOKIE];
    // One-shot: always burn the cookie, success or failure.
    req.res?.clearCookie(GOOGLE_STATE_COOKIE, stateCookieOptions());

    if (typeof raw !== "string" || !raw || typeof providedState !== "string" || !providedState) {
      return fail("Missing OAuth state.");
    }
    try {
      const decoded = jwt.verify(raw, stateSigningKey(), { audience: STATE_AUDIENCE }) as {
        n?: string;
        v?: string;
        next?: string;
        ref?: string;
      };
      if (!decoded.n || !decoded.v || !safeEqual(decoded.n, providedState)) {
        return fail("OAuth state mismatch.");
      }
      const ctx: GoogleOAuthContext = { next: sanitizeNextPath(decoded.next), ref: sanitizeRef(decoded.ref) };
      if (req.res) req.res.locals.googleOAuth = ctx;
      return callback(null, decoded.v, ctx);
    } catch {
      return fail("OAuth state expired or invalid.");
    }
  },
};

// Clears the Google OAuth state cookie from the client response.
// Ensures invalid or abandoned state tokens are burned immediately.
// Prevents cookie accumulation across failed or aborted sign-in attempts.
export const clearGoogleStateCookie = (req: Request) => {
  req.res?.clearCookie(GOOGLE_STATE_COOKIE, stateCookieOptions());
};

// Structural contract representing incoming Google profile attributes.
// Captures user identifiers, display names, email collections, and avatars.
// Accommodates varying response payloads from passport Google strategies.
export interface GoogleProfileLike {
  id?: string;
  displayName?: string;
  emails?: Array<{ value?: string; verified?: boolean | string }>;
  photos?: Array<{ value?: string }>;
}

// Result type representing outcomes of resolving a Google profile to a user.
// Yields either an authenticated user document with link flags or an error.
// Standardizes resolution states for downstream authentication controllers.
export type GoogleResolveResult =
  | { user: IUserDocument; created: boolean; linked: boolean }
  | { error: GoogleAuthErrorCode };

// Evaluates boolean truthiness for profile email verification indicators.
// Accommodates both boolean primitives and stringified boolean values.
// Ensures only authenticated email identities are linked to user accounts.
const isVerified = (flag: unknown) => flag === true || flag === "true";

/** Find, link or create the FinWise user for a verified Google profile. */
// Resolves a Google user profile by finding, linking, or provisioning accounts.
// Enforces verified email constraints and reconciles unverified password accounts.
// Initializes personal workspaces and links attribution referral tokens.
export const resolveGoogleUser = async (
  profile: GoogleProfileLike,
  ctx: GoogleOAuthContext = {},
): Promise<GoogleResolveResult> => {
  const googleId = typeof profile.id === "string" ? profile.id : "";
  if (!googleId) return { error: "google_failed" };

  // Already linked: the Google `sub` is stable, so sign in regardless of later e-mail changes.
  const byGoogleId = await UserModel.findOne({ googleId });
  if (byGoogleId) return { user: byGoogleId, created: false, linked: false };

  const emailEntry = profile.emails?.[0];
  const email = String(emailEntry?.value || "").trim().toLowerCase();
  if (!email) return { error: "google_no_email" };
  if (!isVerified(emailEntry?.verified)) return { error: "google_unverified_email" };

  const photoURL = profile.photos?.[0]?.value;

  const existing = await UserModel.findOne({ email }).select(
    "+password +emailVerificationToken +emailVerificationTokenExpires",
  );
  if (existing) {
    if (existing.googleId && existing.googleId !== googleId) return { error: "google_account_conflict" };

    existing.googleId = googleId;
    if (!existing.photoURL && photoURL) existing.photoURL = photoURL;
    if (!existing.isEmailVerified) {
      // Someone registered this address with a password but never proved ownership. Google just did, so the
      // real owner takes over: drop the unproven credentials.
      existing.password = undefined;
      existing.emailVerificationToken = undefined;
      existing.emailVerificationTokenExpires = undefined;
      existing.authProvider = "google";
      existing.isEmailVerified = true;
    }
    await existing.save();
    return { user: existing, created: false, linked: true };
  }

  const name = String(profile.displayName || "").trim() || email.split("@")[0] || "FinWise user";
  let user: IUserDocument;
  try {
    user = await UserModel.create({
      googleId,
      name,
      email,
      photoURL,
      authProvider: "google",
      isEmailVerified: true,
      pendingReferralCode: ctx.ref,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      // Concurrent first sign-in (double callback): use the winner.
      const raced = await UserModel.findOne({ $or: [{ googleId }, { email }] });
      if (raced && (!raced.googleId || raced.googleId === googleId)) {
        return { user: raced, created: false, linked: false };
      }
      return { error: "google_account_conflict" };
    }
    throw error;
  }

  // Same onboarding as the first authenticated request of an e-mail user: default personal org + membership,
  // and pending referral redemption (ensurePersonalOrgForUser applies pendingReferralCode).
  try {
    await ensurePersonalOrgForUser(user._id as any);
  } catch (error) {
    // Non-fatal: orgContext lazily provisions the org on the first API request.
    logger.warn(`[GoogleOAuth] Default org provisioning deferred for user=${String(user._id)}: ${(error as Error).message}`);
  }
  return { user, created: true, linked: false };
};
