import { sanitizeNextPath } from "@/lib/url";

// Maps machine-readable Google OAuth error codes to descriptive localized strings.
// Explains identity provider failures including denied scopes, unverified emails, and conflicts.
// Precludes displaying raw technical server exception text directly to authenticating users.
/**
 * Google sign-in is a server-side redirect flow (no client id/secret in the SPA). The gateway answers failures with
 * `/login?error=<code>`; codes are a fixed set, never free text.
 */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_unverified_email: "Google could not confirm that your email address is verified, so we could not sign you in.",
  google_no_email: "Google did not share an email address with us, so we could not sign you in.",
  google_account_conflict: "This email is already linked to a different Google account. Sign in with the original method.",
  google_state_invalid: "Your Google sign-in session expired or could not be verified. Please try again.",
  google_denied: "Google sign-in was cancelled. You can try again or use your email and password.",
  google_failed: "Google sign-in failed. Please try again or use your email and password.",
};

// Translates URL error query parameters into friendly user-facing authentication feedback.
// Looks up standardized failure messages with a graceful fallback for unknown codes.
// Returns null when no error code is present to simplify conditional alert rendering.
/** Maps the `?error=` query value to a user-facing message, or null when there is no error. */
export const getAuthErrorMessage = (code: string | null): string | null => {
  if (!code) return null;
  return GOOGLE_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
};

// Constructs the backend Google OAuth initiation redirect URL with query parameters.
// Sanitizes downstream post-login redirect targets and valid uppercase referral codes.
// Directs client browsers to the server authentication gateway to initiate OAuth.
/** Builds `/api/auth/google` with an optional post-login path and referral code. */
export const buildGoogleAuthUrl = (opts: { next?: string | null; ref?: string | null } = {}): string => {
  const params = new URLSearchParams();
  const next = sanitizeNextPath(opts.next ?? null);
  if (next) params.set("next", next);
  const ref = (opts.ref ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{6,16}$/.test(ref)) params.set("ref", ref);
  const qs = params.toString();
  return `/api/auth/google${qs ? `?${qs}` : ""}`;
};
