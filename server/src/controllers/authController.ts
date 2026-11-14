/**
 * @fileoverview Authentication Controller
 *
 * This module handles user authentication, registration, and profile management
 * for the Personal Finance application. It provides endpoints for:
 * - User registration with email verification
 * - Email/password login with brute-force protection
 * - Google OAuth authentication
 * - Email verification and resend functionality
 * - Profile management (get, update, change password)
 * - Logout functionality
 *
 * KEY FEATURES:
 * - JWT-based authentication with HTTP-only cookies
 * - Email verification with OTP (One-Time Password)
 * - Brute-force protection with account lockout
 * - Google OAuth integration
 * - Password hashing with bcrypt
 * - CSRF token generation
 * - Audit logging for security events
 *
 * SECURITY MEASURES:
 * - Passwords are hashed with bcrypt (12 salt rounds for changes)
 * - JWT tokens are stored in HTTP-only cookies
 * - Account lockout after failed login attempts
 * - Email verification required before login
 * - Sensitive fields excluded from query results
 *
 * @module controllers/authController
 */

import { Request, Response } from "express"; // Express types
import jwt from "jsonwebtoken"; // JSON Web Token for authentication
import bcrypt from "bcryptjs"; // Password hashing
import crypto from "crypto"; // Cryptographic functions
import UserModel, { IUserDocument } from "../models/userModel"; // User model
import { sendEmail } from "../utils/sendEmail"; // Email sending utility
import { getEnv } from "../config/env"; // Environment configuration
import { HttpError } from "../middleware/httpError"; // Custom HTTP error class
import { accountLockout, lockoutKey } from "../services/accountLockout"; // Brute-force protection
import { auditFromRequest } from "../services/auditService"; // Audit logging
import { logger } from "../config/logger"; // Application logger
import { getClientBaseUrl, type GoogleOAuthContext } from "../services/googleOAuth"; // Google OAuth helpers
import { consumeSecondFactor, hashChallenge } from "../services/secondFactor";

/**
 * Builds cookie options for JWT token.
 *
 * @param {ReturnType<typeof getEnv>} env - Environment configuration
 * @param {number} maxAgeMs - Cookie max age in milliseconds
 * @returns {object} Cookie options object
 */
// Constructs standardized cookie serialization options based on runtime environment.
// Ensures strict security attributes like HTTP-only and same-site policies are enforced.
// Returns an Express-compatible cookie options object with configured expiration and path.
const buildCookieOptions = (env: ReturnType<typeof getEnv>, maxAgeMs: number) => ({
  httpOnly: true, // Prevent JavaScript access
  secure: env.COOKIE_SECURE, // HTTPS only in production
  sameSite: env.COOKIE_SAME_SITE, // CSRF protection
  domain: env.COOKIE_DOMAIN, // Cookie domain
  maxAge: maxAgeMs, // Cookie expiration
  path: "/", // Cookie path
});

/**
 * Generates JWT token and sets it as an HTTP-only cookie.
 *
 * @param {Response} res - Express response object
 * @param {string} userId - User ID to encode in token
 */
// Signs a standard JSON Web Token carrying the authenticated subject identifier.
// Attaches the generated token to outgoing response headers inside a secure cookie.
// Establishes a protected session credential valid across the client application.
const clearSessionCookie = (res: Response) => {
  const { maxAge: _maxAge, ...options } = buildCookieOptions(getEnv(), 0);
  res.clearCookie("jwt", options);
};

const clearChallengeCookie = (res: Response) => {
  const { maxAge: _maxAge, ...options } = buildCookieOptions(getEnv(), 0);
  res.clearCookie("fw_2fa_challenge", options);
};

export const generateAndSetToken = (res: Response, userId: string, mfa = false, sessionVersion?: string) => {
  const env = getEnv();
  // Generate JWT token with 1-day expiration
  const token = jwt.sign({ id: userId, ...(mfa ? { mfa: true } : {}),
    ...(sessionVersion ? { sv: sessionVersion } : {}) }, env.JWT_SECRET, {
    expiresIn: "1d",
  });
  // Set JWT as HTTP-only cookie (24 hours)
  res.cookie("jwt", token, buildCookieOptions(env, 24 * 60 * 60 * 1000));
};

/**
 * Generates and returns a CSRF token.
 *
 * This endpoint generates a random CSRF token and sets it as a cookie.
 * The token is also returned in the response body for client-side use.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
/**
 * Issues a fresh double-submit CSRF token as a JS-readable cookie and returns the token.
 * Shared by GET /auth/csrf and the Google OAuth callback so Google sessions start with the same cookie pair.
 */
// Produces a cryptographically secure random token used for CSRF defense verification.
// Binds the token value to a client-readable browser cookie with configured lifetime.
// Delivers the raw token string for synchronization across double-submit cookie flows.
export const setCsrfCookie = (res: Response): string => {
  const env = getEnv();
  // Generate random 32-byte CSRF token
  const token = crypto.randomBytes(32).toString("hex");

  // Set CSRF token as cookie (2 hours expiration)
  res.cookie(env.CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Allow JavaScript access
    secure: env.COOKIE_SECURE, // HTTPS only in production
    sameSite: env.COOKIE_SAME_SITE, // CSRF protection
    domain: env.COOKIE_DOMAIN, // Cookie domain
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
    path: "/", // Cookie path
  });
  return token;
};

// Handles API requests asking for a fresh double-submit cross-site request forgery token.
// Issues the cookie on the response and returns the payload containing the secret token.
// Attaches the unique request identifier to support distributed audit tracing.
export const getCsrfToken = async (req: Request, res: Response) => {
  const token = setCsrfCookie(res);

  // Return token in response
  res.status(200).json({ csrf_token: token, request_id: req.requestId });
};

/**
 * Registers a new user with email verification.
 *
 * This endpoint:
 * 1. Validates the request body
 * 2. Checks if user already exists
 * 3. Creates a new user document
 * 4. Generates and sends email verification OTP
 * 5. Returns success response with delivery mode
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @throws {HttpError} If user already exists
 */
// Processes incoming registration submissions for email and password authentication.
// Checks for preexisting accounts before persisting user credentials to the database.
// Dispatches an email verification challenge code with short-lived expiration.
export const register = async (req: Request, res: Response) => {
  const env = getEnv();
  // Extract registration data from request body
  const { name, email, password, phoneNumber, referralCode } = req.body as {
    name: string;
    email: string;
    password: string;
    phoneNumber?: string;
    referralCode?: string;
  };

  logger.info(`[Auth] Registration attempt for email=${email}`);

  // Check if user already exists
  const userExists = await UserModel.findOne({ email }).select("_id").lean();
  if (userExists) {
    throw new HttpError(400, "USER_EXISTS", "User with this email already exists");
  }

  // Create new user document
  const newUser = await UserModel.create({
    name,
    email,
    password,
    phoneNumber,
    authProvider: "email",
    pendingReferralCode: referralCode ? String(referralCode).trim().toUpperCase() : undefined,
  });

  // Generate 6-digit verification OTP
  const verificationToken = crypto.randomInt(100000, 999999).toString();
  newUser.emailVerificationToken = verificationToken;
  newUser.emailVerificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await newUser.save();

  // Send verification email
  const emailResult = await sendEmail({
    to: email,
    subject: "Your Personal Finance Email Verification Code",
    text: `Your verification code is: ${verificationToken}`,
    html: `<p>Your verification code is: <strong>${verificationToken}</strong></p>`,
  });

  // Return success response
  res.status(201).json({
    message: "Registration successful. Please check your email for a verification code.",
    request_id: req.requestId,
    delivery_mode: emailResult.mode,
    dev_otp: env.NODE_ENV !== "production" ? verificationToken : undefined, // Only in development
  });
};

/**
 * Verifies user's email with OTP (One-Time Password).
 *
 * This endpoint:
 * 1. Validates the OTP against the stored token
 * 2. Checks token expiration
 * 3. Marks email as verified
 * 4. Clears verification token
 * 5. Generates JWT token for authentication
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @throws {HttpError} If OTP is invalid or expired
 */
// Validates one-time verification tokens sent to users during account creation.
// Transitions the account state to verified and invalidates the single-use token.
// Automatically issues session authentication cookies upon successful validation.
export const verifyEmail = async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email: string; otp: string };

  logger.info(`[Auth] Email verification attempt for email=${email}`);

  // Find user with matching email and valid OTP
  const user = await UserModel.findOne({
    email,
    isEmailVerified: false,
    twoFactorEnabled: { $ne: true },
    emailVerificationToken: otp,
    emailVerificationTokenExpires: { $gt: Date.now() }, // Check expiration
  }).select("+emailVerificationToken +emailVerificationTokenExpires");

  if (!user) {
    throw new HttpError(400, "INVALID_OTP", "Invalid or expired OTP.");
  }

  // Mark email as verified and clear token
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpires = undefined;
  await user.save();

  // Generate JWT token for authentication
  generateAndSetToken(res, user._id.toString());
  res.status(200).json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    request_id: req.requestId,
  });
};

/**
 * Resends the verification OTP to user's email.
 *
 * This endpoint:
 * 1. Finds unverified user with email provider
 * 2. Generates new verification OTP
 * 3. Sends new verification email
 * 4. Returns success response
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @throws {HttpError} If user not found or already verified
 */
// Handles requests to deliver a fresh verification code to an unverified email address.
// Validates account status and refreshes one-time token values and expiration stamps.
// Sends out an email notification containing the newly generated challenge code.
export const resendVerification = async (req: Request, res: Response) => {
  const env = getEnv();
  const { email } = req.body as { email: string };

  // Find unverified user with email provider
  const user = await UserModel.findOne({
    email,
    authProvider: "email",
    isEmailVerified: false,
  }).select("+emailVerificationToken +emailVerificationTokenExpires");

  if (!user) {
    throw new HttpError(400, "USER_NOT_FOUND", "User not found or has already been verified.");
  }

  // Generate new 6-digit verification OTP
  const verificationToken = crypto.randomInt(100000, 999999).toString();
  user.emailVerificationToken = verificationToken;
  user.emailVerificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  // Send new verification email
  const emailResult = await sendEmail({
    to: email,
    subject: "Your New Personal Finance Verification Code",
    text: `Your new verification code is: ${verificationToken}`,
    html: `<p>Your new verification code is: <strong>${verificationToken}</strong></p>`,
  });

  // Return success response
  res.status(200).json({
    message: "Verification code resent successfully.",
    request_id: req.requestId,
    delivery_mode: emailResult.mode,
    dev_otp: env.NODE_ENV !== "production" ? verificationToken : undefined, // Only in development
  });
};

/**
 * Authenticates user with email and password.
 *
 * This endpoint implements brute-force protection with account lockout:
 * 1. Checks account lockout status
 * 2. Validates user credentials
 * 3. Checks email verification status
 * 4. Records success/failure for lockout tracking
 * 5. Generates JWT token on success
 *
 * SECURITY FEATURES:
 * - Account lockout after failed attempts
 * - Audit logging for all login attempts
 * - Password comparison with bcrypt
 * - Email verification check
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @throws {HttpError} If credentials are invalid or account is locked
 */
// Evaluates email and password credentials for standard interactive authentication.
// Enforces brute-force lockout defenses and audit event logging on repeated failures.
// Establishes authenticated JWT sessions upon successful credential verification.
export const login = async (req: Request, res: Response) => {
  const { email, password, twoFactorCode } = req.body as { email: string; password: string; twoFactorCode?: string };
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  logger.info(`[Auth] Login attempt for email=${normalizedEmail} from IP=${req.ip}`);

  // Brute-force protection: check lockout before doing any DB work
  const key = lockoutKey(normalizedEmail, req.ip);
  const lockStatus = accountLockout.isLocked(key);

  // Check if account is locked
  if (lockStatus.locked) {
    auditFromRequest(req, "account_locked", {
      metadata: { email: normalizedEmail, remainingMs: lockStatus.remainingMs },
    });
    const minutes = Math.ceil(lockStatus.remainingMs / 60000);
    throw new HttpError(
      429,
      "ACCOUNT_LOCKED",
      `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
    );
  }

  // Find user by email
  const user = await UserModel.findOne({ email: normalizedEmail }).select("+password");

  // Google-only accounts have no password: tell the user how to sign in (and do not count it as a brute-force failure).
  if (user && user.authProvider === "google") {
    throw new HttpError(400, "GOOGLE_AUTH_REQUIRED", "This account uses Google sign-in. Please continue with Google.");
  }

  if (!user || !user.password) {
    // Record failed attempt
    accountLockout.recordFailure(key);
    auditFromRequest(req, "login_failed", { metadata: { email: normalizedEmail, reason: "user_not_found" } });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  // Validate password
  const isPasswordValid = await bcrypt.compare(normalizedPassword, user.password);
  if (!isPasswordValid) {
    // Record failed attempt
    accountLockout.recordFailure(key);
    auditFromRequest(req, "login_failed", {
      userId: user._id,
      metadata: { email: normalizedEmail, reason: "wrong_password" },
    });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  // Check email verification
  if (!user.isEmailVerified) {
    throw new HttpError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Email not verified. Please verify your email before logging in."
    );
  }

  if (user.twoFactorEnabled) {
    // Password alone never authorizes a session. Reverify the password on the
    // second submission rather than issuing a bearer token for the interim step.
    if (!twoFactorCode) {
      clearSessionCookie(res);
      res.status(202).json({ two_factor_required: true, request_id: req.requestId });
      return;
    }
    if (!(await consumeSecondFactor(user._id.toString(), twoFactorCode))) {
      accountLockout.recordFailure(key);
      auditFromRequest(req, "2fa_failed", { userId: user._id, metadata: { phase: "password_login" } });
      throw new HttpError(401, "INVALID_SECOND_FACTOR", "Invalid or previously used authentication code.");
    }
  }

  // Success — clear lockout counter only after both factors pass.
  accountLockout.recordSuccess(key);
  auditFromRequest(req, "login_success", { userId: user._id });

  // Generate JWT token only after every enabled factor passes.
  generateAndSetToken(res, user._id.toString(), !!user.twoFactorEnabled, user.sessionVersion);
  res.status(200).json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    twoFactorEnabled: !!(user as any).twoFactorEnabled,
    request_id: req.requestId,
  });
};

/**
 * Handles a successful Google OAuth callback (state + PKCE already verified by passport, user resolved).
 *
 * Requires a one-time second-factor challenge for enrolled accounts before issuing a session.
 * Otherwise issues a JWT and redirects to the sanitized destination.
 */
// Handles redirection and callback processing following Google OAuth authentication.
// Emits audit logging and configures session tokens along with CSRF protection cookies.
// Redirects the client agent back to the destination application interface route.
export const getGoogleCallback = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const ctx = (res.locals.googleOAuth ?? {}) as GoogleOAuthContext;
  const outcome = (res.locals.googleOAuthResult ?? {}) as { created?: boolean; linked?: boolean };

  // Only the internal user id is logged: no e-mail, name or tokens.
  logger.info(
    `[Auth] Google sign-in success user=${user._id} created=${Boolean(outcome.created)} linked=${Boolean(outcome.linked)}`,
  );
  // Re-read current state: a cached OAuth profile must not bypass newly enabled 2FA.
  const current = await UserModel.findById(user._id).select("twoFactorEnabled sessionVersion").lean();
  if (!current) throw new HttpError(401, "UNAUTHORIZED", "Account no longer exists");
  if (current.twoFactorEnabled) {
    const nonce = crypto.randomBytes(32).toString("hex");
    const updated = await UserModel.updateOne(
      { _id: user._id, twoFactorEnabled: true },
      { $set: { twoFactorChallengeHash: hashChallenge(nonce), twoFactorChallengeExpires: new Date(Date.now() + 5 * 60_000) } },
    );
    if (!updated.matchedCount) throw new HttpError(401, "UNAUTHORIZED", "Start sign-in again");
    const token = jwt.sign({ sub: user._id.toString(), purpose: "oauth_2fa", nonce, next: ctx.next || "/dashboard" }, getEnv().JWT_SECRET, { expiresIn: "5m" });
    clearSessionCookie(res);
    res.cookie("fw_2fa_challenge", token, buildCookieOptions(getEnv(), 5 * 60_000));
    setCsrfCookie(res);
    res.redirect(`${getClientBaseUrl()}/login?mfa=required`);
    return;
  }

  auditFromRequest(req, "login_success", {
    userId: user._id,
    metadata: { provider: "google", created: Boolean(outcome.created), linked: Boolean(outcome.linked) },
  });
  clearChallengeCookie(res);
  generateAndSetToken(res, user._id.toString(), false, current.sessionVersion);
  setCsrfCookie(res);
  res.redirect(`${getClientBaseUrl()}${ctx.next || "/dashboard"}`);
};

/** Completes a Google sign-in using a short-lived, single-use challenge cookie. */
export const completeOAuth2FA = async (req: Request, res: Response) => {
  const token = req.cookies?.fw_2fa_challenge;
  let challenge: { sub?: string; purpose?: string; nonce?: string; next?: string };
  try {
    challenge = jwt.verify(token || "", getEnv().JWT_SECRET, { algorithms: ["HS256"] }) as typeof challenge;
  } catch {
    throw new HttpError(401, "INVALID_CHALLENGE", "Sign in with Google again.");
  }
  if (challenge.purpose !== "oauth_2fa" || !challenge.sub || !challenge.nonce || !/^[a-f0-9]{64}$/.test(challenge.nonce)) {
    throw new HttpError(401, "INVALID_CHALLENGE", "Sign in with Google again.");
  }
  const user = await UserModel.findById(challenge.sub).select("email twoFactorEnabled sessionVersion").lean();
  if (!user?.twoFactorEnabled) throw new HttpError(401, "INVALID_CHALLENGE", "Sign in with Google again.");
  const key = lockoutKey(user.email, req.ip);
  if (accountLockout.isLocked(key).locked) throw new HttpError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.");
  if (!(await consumeSecondFactor(user._id.toString(), req.body.code))) {
    accountLockout.recordFailure(key);
    auditFromRequest(req, "2fa_failed", { userId: user._id, metadata: { phase: "google_login" } });
    throw new HttpError(401, "INVALID_SECOND_FACTOR", "Invalid or previously used authentication code.");
  }
  const consumed = await UserModel.updateOne(
    { _id: user._id, twoFactorEnabled: true, twoFactorChallengeHash: hashChallenge(challenge.nonce), twoFactorChallengeExpires: { $gt: new Date() } },
    { $unset: { twoFactorChallengeHash: 1, twoFactorChallengeExpires: 1 } },
  );
  if (!consumed.modifiedCount) throw new HttpError(401, "INVALID_CHALLENGE", "Sign in with Google again.");
  accountLockout.recordSuccess(key);
  auditFromRequest(req, "login_success", { userId: user._id, metadata: { provider: "google", second_factor: true } });
  clearChallengeCookie(res);
  generateAndSetToken(res, user._id.toString(), true, user.sessionVersion);
  // Do not trust a client-supplied destination; next was captured in the signed OAuth flow.
  res.json({ id: user._id.toString(), next: challenge.next || "/dashboard", request_id: req.requestId });
};

/**
 * Gets the current user's profile.
 *
 * This endpoint returns the authenticated user's profile information.
 *
 * @param {Request} req - Express request object (with user from JWT)
 * @param {Response} res - Express response object
 */
// Retrieves profile metadata and current account state for authenticated sessions.
// Formats user identifiers, contact information, and verification status fields.
// Responds with sanitized identity properties while masking private credential data.
export const getProfile = (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  res.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    phoneNumber: (user as any).phoneNumber || null,
    authProvider: user.authProvider || "email",
    isEmailVerified: user.isEmailVerified ?? false,
    request_id: req.requestId,
  });
};

/**
 * Updates the current user's profile.
 *
 * This endpoint updates the authenticated user's name and phone number.
 *
 * @param {Request} req - Express request object (with user from JWT)
 * @param {Response} res - Express response object
 */
// Mutates user profile properties based on authenticated request payload updates.
// Sanitizes incoming string inputs such as display name and contact phone number.
// Commits the modified entity attributes to persistent storage and returns updated info.
export const updateProfile = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const { name, phoneNumber } = req.body as { name?: string; phoneNumber?: string };

  // Update fields if provided
  if (name !== undefined) user.name = String(name).trim();
  if (phoneNumber !== undefined) (user as any).phoneNumber = String(phoneNumber).trim();

  await user.save();

  res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      phoneNumber: (user as any).phoneNumber || null,
    },
    message: "Profile updated successfully",
    request_id: req.requestId,
  });
};

/**
 * Changes the current user's password.
 *
 * This endpoint:
 * 1. Validates current password
 * 2. Checks new password strength
 * 3. Hashes and saves new password
 *
 * @param {Request} req - Express request object (with user from JWT)
 * @param {Response} res - Express response object
 * @throws {HttpError} If current password is incorrect or new password is weak
 */
// Authenticates existing password credentials prior to changing account access keys.
// Validates password complexity requirements and updates the stored credential hash.
// Persists the new credential securely and notifies caller of successful mutation.
export const changePassword = async (req: Request, res: Response) => {
  // Find user with password field
  const user = await UserModel.findById((req.user as IUserDocument)._id).select("+password");
  if (!user || !user.password) {
    throw new HttpError(400, "CANNOT_CHANGE_PASSWORD", "Cannot change password for this account.");
  }

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  // Validate current password
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    throw new HttpError(401, "INVALID_PASSWORD", "Current password is incorrect.");
  }

  // Check new password strength
  if (newPassword.length < 8) {
    throw new HttpError(400, "WEAK_PASSWORD", "New password must be at least 8 characters.");
  }

  // Set raw password — the User model pre("save") hook will hash it
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: "Password changed successfully",
    request_id: req.requestId,
  });
};

/**
 * Logs out the current user.
 *
 * This endpoint clears the JWT cookie to log out the user.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
// Terminates active authenticated user sessions by clearing the session cookie.
// Enforces domain and path matching to guarantee client-side cookie removal.
// Returns an acknowledgement payload accompanied by the unique request identifier.
export const logout = (req: Request, res: Response) => {
  logger.info(`[Auth] Logout request from IP=${req.ip}`);

  // Clear JWT cookie
  clearSessionCookie(res);
  clearChallengeCookie(res);
  res.status(200).json({ message: "Logged out successfully", request_id: req.requestId });
};

/**
 * Instant Demo Login for Hackathon Evaluators and Challenge Reviewers.
 * Authenticates as J Ganesh Kumar Reddy (Primary Registrant).
 */
export const demoEvaluatorLogin = async (req: Request, res: Response) => {
  const email = "evaluator.ganesh@gnani.ai";
  let user = await UserModel.findOne({ email });

  if (!user) {
    user = new UserModel({
      name: "J Ganesh Kumar Reddy",
      email,
      password: "GnaniChallenge2026!Secure",
      isEmailVerified: true,
      authProvider: "email",
    });
    await user.save();
  }

  generateAndSetToken(res, user._id.toString(), false, user.sessionVersion);
  setCsrfCookie(res);

  return res.status(200).json({
    success: true,
    data: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      currency: "INR",
    },
    message: "Logged in as Challenge Evaluator (J Ganesh Kumar Reddy)",
  });
};
