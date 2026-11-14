/**
 * @fileoverview Passport.js Authentication Configuration
 *
 * This module configures Passport.js authentication strategies for the FinWise application.
 * Passport.js is a popular authentication middleware for Node.js that uses a "strategy"
 * pattern to support multiple authentication methods.
 *
 * AUTHENTICATION STRATEGIES:
 * 1. **JWT Strategy** (always configured):
 *    - Extracts JWT tokens from HTTP-only cookies (not Authorization header)
 *    - Validates tokens against JWT_SECRET
 *    - Looks up the user in MongoDB by the ID embedded in the token
 *    - Used for all authenticated API requests
 *
 * 2. **Google OAuth 2.0 Strategy** (optional, requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET):
 *    - Handles the OAuth 2.0 authorization code flow
 *    - Creates or links user accounts based on Google profile
 *    - Auto-verifies email for Google-authenticated users
 *
 * SECURITY CONSIDERATIONS:
 * - JWT tokens are stored in HTTP-only cookies (not localStorage) to prevent XSS attacks
 * - The JWT strategy reads from cookies, not the Authorization header, for this reason
 * - Google OAuth links accounts by email only when Google reports the email as verified
 * - OAuth state + PKCE verifier live in a signed httpOnly cookie (see services/googleOAuth.ts)
 *
 * PRODUCTION INSIGHTS:
 * - Passport.js is configured once at startup, not per-request
 * - The `done` callback follows Node.js error-first convention: done(error, user)
 * - Returning `done(null, false)` means "no user found" (not an error)
 *
 * @module config/passport
 */

// ── Imports ───────────────────────────────────────────────────────────
import passport from "passport";                                    // Authentication middleware
import { CachedJwtStrategy as JwtStrategy } from "./cachedJwtStrategy"; // JWT cookie auth (cached user, per-request fast path)
import { Strategy as GoogleStrategy } from "passport-google-oauth20"; // Google OAuth 2.0
import UserModel from "../models/userModel";                        // Mongoose User model
import { getEnv } from "./env";                                     // Environment configuration
import { logger } from "./logger";                                  // Application logger
import {
  getGoogleCallbackUrl,
  googleStateStore,
  resolveGoogleUser,
  type GoogleOAuthContext,
  type GoogleProfileLike,
} from "../services/googleOAuth";             // Google find/link/create + cookie state store

// Configures Passport authentication strategies including cookie-based JWT and Google OAuth 2.0.
// Registers authentication callbacks, user token validation hooks, and automated account linking.
export const configurePassport = () => {
  const env = getEnv();

  logger.info("[Passport] Configuring authentication strategies...");

  // ── JWT Strategy ──────────────────────────────────────────────────
  // This strategy validates JWT tokens from HTTP-only cookies.
  // JWT is extracted from the "jwt" cookie (not Authorization header)
  // because HTTP-only cookies provide XSS protection.
  logger.info("[Passport] Registering JWT strategy (cookie-based)");
  passport.use(
    "jwt",
    new JwtStrategy(
      {
        // Custom extractor: reads JWT from the "jwt" cookie instead of Authorization header
        // This is more secure because HTTP-only cookies can't be accessed by JavaScript (XSS protection)
        jwtFromRequest: req => {
          const token = (req as any)?.cookies?.jwt;
          return token || null; // Return null if no cookie (triggers "no token" failure)
        },
        // The secret key used to verify the JWT signature
        secretOrKey: env.JWT_SECRET,
      }
      // The verify step (user lookup by payload id, served from the auth cache)
      // and the per-request fast path live in CachedJwtStrategy.
    )
  );

  // ── Google OAuth 2.0 Strategy ─────────────────────────────────────
  // Only configured if Google OAuth credentials are provided.
  // The callback URL must match what's configured in Google Cloud Console.
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = getGoogleCallbackUrl();
    // Never log the client id/secret or any profile data: only the callback path that must be allow-listed.
    logger.info(`[Passport] Registering Google OAuth strategy (callback: ${callbackURL})`);

    passport.use(
      "google",
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID, // From Google Cloud Console
          clientSecret: env.GOOGLE_CLIENT_SECRET, // From Google Cloud Console
          callbackURL, // Must match an "Authorized redirect URI" in Google Cloud Console
          scope: ["profile", "email"],
          // State + PKCE are enforced through a signed, short-lived cookie (no server session needed).
          pkce: true,
          store: googleStateStore,
          passReqToCallback: true,
        } as any,
        // _accessToken / _refreshToken are unused: we issue our own JWT cookie.
        async (req: any, _accessToken: string, _refreshToken: string, profile: GoogleProfileLike, done: any) => {
          try {
            const ctx = (req?.res?.locals?.googleOAuth ?? {}) as GoogleOAuthContext;
            const result = await resolveGoogleUser(profile, ctx);
            if ("error" in result) {
              return done(null, false, { code: result.error, message: result.error });
            }
            if (req?.res) req.res.locals.googleOAuthResult = { created: result.created, linked: result.linked };
            return done(null, result.user);
          } catch (error) {
            return done(error as any, false);
          }
        }
      )
    );
  } else if (env.NODE_ENV !== "test") {
    // Log a warning if Google OAuth is not configured (except in test environment)
    logger.warn("[Passport] Google OAuth DISABLED — credentials not found in environment");
    logger.warn("[Passport] Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in");
  }

  logger.info("[Passport] Strategy configuration complete");
};

// Export the configured passport instance for use in middleware
export default passport;

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Strategy Pattern**: Passport.js uses the strategy pattern to decouple
 *    authentication logic from route handlers. Each strategy is a self-contained
 *    authentication mechanism.
 *
 * 2. **Account Linking**: The Google OAuth strategy implements a 3-tier lookup:
 *    - Existing Google-linked user → sign in
 *    - Existing email user → link Google account
 *    - New user → create account
 *
 * 3. **HTTP-Only Cookies vs Authorization Header**: This app stores JWTs in
 *    HTTP-only cookies for XSS protection. The Authorization header approach
 *    is more common in APIs but requires careful token storage on the client.
 *
 * 4. **Error-First Callbacks**: The `done(error, user)` convention is a Node.js
 *    pattern where the first argument is always an error (or null).
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * passport.ts → called by server.ts at startup
 * passport.authenticate("jwt") → used in route middleware to protect endpoints
 * passport.authenticate("google") → used in auth routes for OAuth flow
 * ══════════════════════════════════════════════════════════════════════
 */
