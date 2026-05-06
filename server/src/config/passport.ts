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
 * - Google OAuth links accounts by email if a user with the same email already exists
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
import { Strategy as JwtStrategy } from "passport-jwt";            // JWT token authentication
import { Strategy as GoogleStrategy } from "passport-google-oauth20"; // Google OAuth 2.0
import UserModel from "../models/userModel";                        // Mongoose User model
import { getEnv } from "./env";                                     // Environment configuration
import { logger } from "./logger";                                  // Application logger

/**
 * Configures all Passport.js authentication strategies.
 *
 * This function is called once during server startup (in server.ts).
 * It registers strategies with Passport, which are then available
 * for use in route middleware via passport.authenticate().
 *
 * STRATEGY REGISTRATION ORDER:
 * 1. JWT strategy (always) - for API authentication
 * 2. Google OAuth strategy (optional) - for social login
 */
export const configurePassport = () => {
  const env = getEnv();

  // ── JWT Strategy ──────────────────────────────────────────────────
  // This strategy validates JWT tokens from HTTP-only cookies
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
      },
      // Verify callback: called after JWT is decoded
      // jwtPayload contains the decoded token claims (id, email, etc.)
      async (jwtPayload, done) => {
        try {
          // Look up the user by the ID stored in the JWT payload
          const user = await UserModel.findById(jwtPayload.id);
          if (user) {
            return done(null, user); // Success: attach user to req.user
          }
          // User not found (may have been deleted after token was issued)
          return done(null, false);
        } catch (error) {
          // Database error or other unexpected failure
          return done(error as any, false);
        }
      }
    )
  );

  // ── Google OAuth 2.0 Strategy ─────────────────────────────────────
  // Only configured if Google OAuth credentials are provided
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      "google",
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,       // From Google Cloud Console
          clientSecret: env.GOOGLE_CLIENT_SECRET, // From Google Cloud Console
          // Callback URL that Google redirects to after user approves
          callbackURL: env.GOOGLE_CALLBACK_URL || "/api/v1/auth/google/callback",
        },
        // This callback receives the OAuth tokens and the user's Google profile
        // _accessToken and _refreshToken are not used (we issue our own JWT)
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            // STRATEGY 1: Check if user already linked their Google account
            let user = await UserModel.findOne({ googleId: profile.id });
            if (user) {
              return done(null, user); // Existing Google-linked user
            }

            // STRATEGY 2: Check if user exists with the same email (account linking)
            // This handles the case where a user registered with email/password
            // and later tries to sign in with Google using the same email
            user = await UserModel.findOne({ email: profile.emails?.[0]?.value });
            if (user) {
              // Link Google account to existing user
              user.googleId = profile.id;
              user.photoURL = profile.photos?.[0]?.value;
              user.isEmailVerified = true; // Google verifies emails, so we can trust this
              await user.save();
              return done(null, user);
            }

            // STRATEGY 3: Create a new user from Google profile
            user = await UserModel.create({
              googleId: profile.id,
              name: profile.displayName,
              email: profile.emails?.[0]?.value,
              photoURL: profile.photos?.[0]?.value,
              authProvider: "google",      // Track the auth method
              isEmailVerified: true,       // Google verifies emails
            });
            return done(null, user);
          } catch (error) {
            return done(error as any, false);
          }
        }
      )
    );
  } else if (env.NODE_ENV !== "test") {
    // Log a warning if Google OAuth is not configured (except in test environment)
    logger.warn("Google OAuth credentials not found; Google authentication will not work");
  }
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
