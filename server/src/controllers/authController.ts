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

/**
 * Builds cookie options for JWT token.
 *
 * @param {ReturnType<typeof getEnv>} env - Environment configuration
 * @param {number} maxAgeMs - Cookie max age in milliseconds
 * @returns {object} Cookie options object
 */
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
const generateAndSetToken = (res: Response, userId: string) => {
  const env = getEnv();
  // Generate JWT token with 1-day expiration
  const token = jwt.sign({ id: userId }, env.JWT_SECRET, {
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
export const getCsrfToken = async (req: Request, res: Response) => {
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
export const verifyEmail = async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email: string; otp: string };

  // Find user with matching email and valid OTP
  const user = await UserModel.findOne({
    email,
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
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  // Brute-force protection: check lockout before doing any DB work
  const { accountLockout, lockoutKey } = require("../services/accountLockout");
  const { auditFromRequest } = require("../services/auditService");
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
  if (!user || !user.password) {
    // Record failed attempt
    accountLockout.recordFailure(key);
    auditFromRequest(req, "login_failed", { metadata: { email: normalizedEmail, reason: "user_not_found" } });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  // Check if user uses Google auth
  if (user.authProvider === "google") {
    throw new HttpError(400, "GOOGLE_AUTH_REQUIRED", "This account uses Google sign-in. Please continue with Google.");
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

  // Success — clear lockout counter
  accountLockout.recordSuccess(key);
  auditFromRequest(req, "login_success", { userId: user._id });

  // Generate JWT token
  generateAndSetToken(res, user._id.toString());
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
 * Handles Google OAuth callback.
 *
 * This endpoint is called after successful Google OAuth authentication.
 * It generates a JWT token and redirects to the chat page.
 *
 * @param {Request} req - Express request object (with user from Passport)
 * @param {Response} res - Express response object
 */
export const getGoogleCallback = (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  // Generate JWT token
  generateAndSetToken(res, user._id.toString());
  // Redirect to chat page
  const clientUrl = getEnv().CLIENT_URL.replace(/\/$/, "");
  res.redirect(`${clientUrl}/chat`);
};

/**
 * Gets the current user's profile.
 *
 * This endpoint returns the authenticated user's profile information.
 *
 * @param {Request} req - Express request object (with user from JWT)
 * @param {Response} res - Express response object
 */
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

  // Hash and save new password (12 salt rounds)
  user.password = await bcrypt.hash(newPassword, 12);
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
export const logout = (req: Request, res: Response) => {
  const env = getEnv();
  // Clear JWT cookie
  res.clearCookie("jwt", {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
    path: "/",
  });
  res.status(200).json({ message: "Logged out successfully", request_id: req.requestId });
};
