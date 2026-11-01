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
import { Router } from "express";
import passport from "passport";
import {
  register,
  login,
  verifyEmail,
  getGoogleCallback,
  resendVerification,
  getCsrfToken,
  getProfile,
  updateProfile,
  changePassword,
  logout,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  loginBodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema
} from "../schemas/authSchemas";
import { getEnv } from "../config/env";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();
const env = getEnv();
const CLIENT_URL = env.CLIENT_URL.replace(/\/$/, "");

// Determine if Google OAuth is available based on environment variables.
// Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be present.
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// Log Google OAuth availability on module load
if (googleEnabled) {
  console.log("[AuthRoutes] Google OAuth is ENABLED — /api/auth/google is available");
} else {
  console.warn("[AuthRoutes] Google OAuth is DISABLED — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
}

router.get("/providers", (req, res) => {
  res.json({ email: true, google: googleEnabled, request_id: req.requestId });
});

router.get("/csrf", asyncRoute(getCsrfToken));

router.post("/register", validate({ body: registerBodySchema }), asyncRoute(register));

router.post("/login", validate({ body: loginBodySchema }), asyncRoute(login));

router.post("/verify-email", validate({ body: verifyEmailBodySchema }), asyncRoute(verifyEmail));

router.post(
  "/resend-verification",
  validate({ body: resendVerificationBodySchema }),
  asyncRoute(resendVerification)
);

if (googleEnabled) {
  router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  router.get(
    "/google/callback",
    passport.authenticate("google", {
      failureRedirect: `${CLIENT_URL}/login`,
      session: false,
    }),
    asyncRoute(getGoogleCallback)
  );
} else {
  router.get("/google", (req, res) => {
    res.status(501).json({
      message: "Google OAuth is not configured on this server.",
      code: "OAUTH_NOT_CONFIGURED",
      request_id: req.requestId,
    });
  });
  router.get("/google/callback", (req, res) => {
    res.status(501).json({
      message: "Google OAuth is not configured on this server.",
      code: "OAUTH_NOT_CONFIGURED",
      request_id: req.requestId,
    });
  });
}

router.get(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getProfile)
);

router.put(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(updateProfile)
);

router.post(
  "/password",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(changePassword)
);

router.post("/logout", asyncRoute(logout));

export default router;
