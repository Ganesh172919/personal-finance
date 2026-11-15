/**
 * @fileoverview Authentication routes for user registration, login, email verification,
 * Google OAuth, profile management, and password changes.
 *
 * Endpoints:
 *   GET    /providers              - List available auth providers (email, google)
 *   GET    /csrf                   - Get a CSRF token for form submissions
 *   POST   /register              - Register a new user account
 *   POST   /login                 - Authenticate with email/password
 *   POST   /verify-email          - Verify email address with OTP
 *   POST   /resend-verification   - Resend verification email
 *   GET    /google                - Initiate Google OAuth flow
 *   GET    /google/callback       - Google OAuth callback handler
 *   GET    /profile               - Get authenticated user's profile (JWT required)
 *   PUT    /profile               - Update authenticated user's profile (JWT required)
 *   POST   /password              - Change password (JWT required)
 *   POST   /logout                - Log out current session
 *
 * Middleware:
 *   - Rate limiting (authRateLimiter) on register, login, verify-email, resend-verification
 *   - Passport JWT authentication on profile and password endpoints
 *   - Zod validation (authSchemas) on request bodies
 *
 * Controllers: authController
 */
import { Router, type RequestHandler, type Response } from "express";
import passport from "passport";
import {
  register,
  login,
  verifyEmail,
  getGoogleCallback,
  completeOAuth2FA,
  resendVerification,
  getCsrfToken,
  getProfile,
  updateProfile,
  changePassword,
  logout,
  demoEvaluatorLogin,
  isEvaluatorDemoEnabled,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  loginBodySchema,
  completeOAuth2FABodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema,
  updateProfileBodySchema,
  changePasswordBodySchema
} from "../schemas/authSchemas";
import { asyncRoute } from "../utils/asyncRoute";
import { logger } from "../config/logger";
import {
  GOOGLE_ERROR_CODES,
  clearGoogleStateCookie,
  getClientBaseUrl,
  isGoogleOAuthEnabled,
  type GoogleAuthErrorCode,
} from "../services/googleOAuth";

// Initializes Express router instance for user authentication flows.
// Handles registration, login sessions, OAuth integrations, and profile security.
// Applies rate limiting, Zod schema validation, and passport middleware.
const router = Router();

// Exposes dynamic state of enabled authentication providers to clients.
// Checks whether Google OAuth strategy credentials are actively configured.
// Returns JSON payload containing supported authentication mechanisms.
// Google OAuth availability is evaluated per request (credentials present AND strategy registered),
// so /providers always reflects the live configuration.
router.get("/providers", (req, res) => {
  res.json({ email: true, google: isGoogleOAuthEnabled(), demo: isEvaluatorDemoEnabled(), request_id: req.requestId });
});

// Issues a cryptographically signed CSRF protection token for forms.
// Mitigates cross-site request forgery attacks on state-changing requests.
// Dispatches token generation via getCsrfToken controller handler.
router.get("/csrf", asyncRoute(getCsrfToken));

// Registers a new user account with provided email and password credentials.
// Validates registration input against schema constraints and uniqueness rules.
// Passes registration flow to register controller inside asyncRoute wrapper.
router.post("/register", validate({ body: registerBodySchema }), asyncRoute(register));

// Authenticates user credentials and provisions authenticated session token.
// Validates email format and password strength against loginBodySchema.
// Invokes login controller handler to verify hash and sign JWT token.
router.post("/login", validate({ body: loginBodySchema }), asyncRoute(login));
router.post("/2fa/complete", validate({ body: completeOAuth2FABodySchema }), asyncRoute(completeOAuth2FA));

// Verifies newly registered user account via email one-time passcode token.
// Validates token format and email address against verifyEmailBodySchema.
// Commits user verification state using verifyEmail controller handler.
router.post("/verify-email", validate({ body: verifyEmailBodySchema }), asyncRoute(verifyEmail));

// Dispatches a new email verification code to user registered mailbox.
// Enforces request rate limits and validates resendVerificationBodySchema fields.
// Calls resendVerification controller to issue and email fresh passcode.
router.post(
  "/resend-verification",
  validate({ body: resendVerificationBodySchema }),
  asyncRoute(resendVerification)
);

// Guards Google OAuth routes by verifying provider registration status.
// Short-circuits with 501 Not Implemented if OAuth credentials are missing.
// Passes request down middleware chain if provider is operational.
const requireGoogle: RequestHandler = (req, res, next) => {
  if (isGoogleOAuthEnabled()) return next();
  res.status(501).json({
    message: "Google OAuth is not configured on this server.",
    code: "OAUTH_NOT_CONFIGURED",
    request_id: req.requestId,
  });
};

// Redirects browser client to login page appending OAuth failure error query.
// Sanitizes and encodes error code parameter to prevent query injection.
// Ensures user receives informative failure prompt on client application.
const redirectToLoginError = (res: Response, code: GoogleAuthErrorCode) => {
  res.redirect(`${getClientBaseUrl()}/login?error=${encodeURIComponent(code)}`);
};

// Initiates Google OAuth 2.0 single sign-on authentication flow.
// Sets PKCE challenge verifier in secure state cookie before redirection.
// Dispatches browser redirect to Google identity account selection.
// Leg 1: redirect to Google (state + PKCE verifier are stored in a signed, short-lived cookie).
// Optional query: ?next=/relative/path (post-login destination) and ?ref=CODE (referral for new accounts).
router.get(
  "/google",
  requireGoogle,
  passport.authenticate("google", { scope: ["profile", "email"], session: false, prompt: "select_account" } as any)
);

// Handles OAuth callback containing authorization code or error parameters.
// Validates state token, exchanges code for user profile, and registers session.
// Completes sign-in handshake via getGoogleCallback controller handler.
// Leg 2: Google redirects back here with ?code&state (or ?error=access_denied).
router.get(
  "/google/callback",
  requireGoogle,
  (req, res, next) => {
    // User cancelled / Google reported an error / no code: never let passport restart the flow from the callback.
    if (typeof req.query.error === "string" || typeof req.query.code !== "string" || !req.query.code) {
      clearGoogleStateCookie(req);
      return redirectToLoginError(res, req.query.error === "access_denied" ? "google_denied" : "google_failed");
    }
    passport.authenticate("google", { session: false }, (err: unknown, user: unknown, info: any) => {
      if (err) {
        // Log the class of failure only: provider errors can embed request details.
        logger.warn(`[Auth] Google OAuth callback error: ${(err as Error)?.name || "Error"}`);
        return redirectToLoginError(res, "google_failed");
      }
      if (!user) {
        const code = GOOGLE_ERROR_CODES.includes(info?.code) ? (info.code as GoogleAuthErrorCode) : "google_failed";
        return redirectToLoginError(res, code);
      }
      req.user = user as any;
      next();
    })(req, res, next);
  },
  asyncRoute(getGoogleCallback)
);

// Retrieves profile information and account preferences for authenticated user.
// Enforces passport JWT bearer token authentication middleware.
// Invokes getProfile controller inside asynchronous route wrapper.
router.get(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getProfile)
);

// Updates authenticated user profile details such as name and preferences.
// Enforces JWT session validation and updateProfileBodySchema constraints.
// Commits user profile modifications via updateProfile controller handler.
router.put(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  validate({ body: updateProfileBodySchema }),
  asyncRoute(updateProfile)
);

// Updates account credentials with new password following verification.
// Validates current and new password constraints against schema rules.
// Invokes changePassword controller to hash and store updated credentials.
router.post(
  "/password",
  passport.authenticate("jwt", { session: false }),
  validate({ body: changePasswordBodySchema }),
  asyncRoute(changePassword)
);

// Invalidates active user session and clears authentication cookies.
// Performs session cleanup across cache and authorization stores.
// Dispatches sign-out processing via logout controller handler.
router.post("/logout", asyncRoute(logout));

// Instant Evaluator Demo Access for Hackathon Judges & Challenge Reviewers
router.post("/demo-evaluator", asyncRoute(demoEvaluatorLogin));

// Exports configured authentication router instance as default module export.
// Mounts into main server router providing comprehensive auth endpoints.
// Serves login, registration, verification, and session lifecycle routes.
export default router;
