/**
 * @fileoverview User Model
 *
 * This module defines the User schema and model for the Personal Finance application.
 * It handles user authentication, profile management, and security features.
 *
 * KEY FEATURES:
 * - Email/password authentication
 * - Google OAuth authentication
 * - Email verification system
 * - Two-Factor Authentication (2FA) support
 * - Referral code system
 * - Automatic password hashing with bcrypt
 * - Timestamps for created/updated tracking
 *
 * SECURITY FEATURES:
 * - Passwords are hashed with bcrypt (10 salt rounds)
 * - Sensitive fields (password, tokens, 2FA secrets) are excluded from queries by default
 * - Email verification tokens have expiration dates
 * - 2FA backup codes for account recovery
 *
 * @module models/userModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM
import bcrypt from "bcryptjs"; // Password hashing library

/**
 * User Interface
 *
 * Defines the structure of a user document in MongoDB.
 */
export interface IUser {
  email: string; // User's email address (unique, lowercase, trimmed)
  name: string; // User's display name
  password?: string; // Hashed password (optional for Google auth users)
  googleId?: string; // Google OAuth ID (unique, sparse)
  photoURL?: string; // Profile photo URL
  phoneNumber?: string; // User's phone number
  authProvider: "email" | "google"; // Authentication provider
  isEmailVerified: boolean; // Whether email is verified
  emailVerificationToken?: string; // Token for email verification
  emailVerificationTokenExpires?: Date; // Expiration date for verification token
  pendingReferralCode?: string; // Referral code pending redemption
  referralRedeemedAt?: Date; // When referral was redeemed
  // Two-Factor Authentication fields
  twoFactorEnabled?: boolean; // Whether 2FA is enabled
  twoFactorSecret?: string; // TOTP secret key
  twoFactorPendingSecret?: string; // Pending 2FA secret (during setup)
  twoFactorBackupCodes?: string[]; // Backup codes for account recovery
}

/**
 * User Document Interface
 *
 * Extends IUser with Mongoose Document methods and _id field.
 */
export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId; // MongoDB ObjectId
}

/**
 * User Schema Definition
 *
 * Defines the structure and validation rules for user documents.
 *
 * FIELD OPTIONS:
 * - required: Field must be present
 * - unique: Field must be unique across all documents
 * - trim: Remove leading/trailing whitespace
 * - lowercase: Convert to lowercase before saving
 * - select: Exclude from query results by default (sensitive data)
 * - sparse: Allow multiple documents with null/undefined values
 * - default: Default value if not provided
 * - enum: Restrict to specific values
 * - maxlength: Maximum string length
 */
const userSchema = new Schema<IUserDocument>(
  {
    // Email address (unique, lowercase, trimmed)
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    // Display name
    name: { type: String, required: true },
    // Hashed password (excluded from queries by default)
    password: { type: String, select: false },
    // Google OAuth ID (unique, sparse - allows multiple null values)
    googleId: { type: String, unique: true, sparse: true },
    // Profile photo URL
    photoURL: { type: String },
    // Phone number
    phoneNumber: { type: String },
    // Authentication provider (email or Google)
    authProvider: { type: String, required: true, enum: ["email", "google"] },
    // Email verification status
    isEmailVerified: { type: Boolean, default: false },
    // Email verification token (excluded from queries)
    emailVerificationToken: { type: String, select: false },
    // Email verification token expiration (excluded from queries)
    emailVerificationTokenExpires: { type: Date, select: false },
    // Pending referral code (trimmed, uppercase, max 16 chars)
    pendingReferralCode: { type: String, trim: true, uppercase: true, maxlength: 16 },
    // When referral was redeemed
    referralRedeemedAt: { type: Date },
    // Two-Factor Authentication fields
    twoFactorEnabled: { type: Boolean, default: false }, // Whether 2FA is enabled
    twoFactorSecret: { type: String, select: false }, // TOTP secret (excluded from queries)
    twoFactorPendingSecret: { type: String, select: false }, // Pending 2FA secret (excluded from queries)
    twoFactorBackupCodes: { type: [String], select: false, default: undefined }, // Backup codes (excluded from queries)
  },
  { timestamps: true } // Automatically add createdAt and updatedAt fields
);

/**
 * Pre-save Middleware
 *
 * Automatically hashes the password before saving to database.
 * Only hashes if:
 * 1. The password field has been modified
 * 2. The password field exists (not null/undefined)
 *
 * Uses bcrypt with 10 salt rounds for secure hashing.
 */
userSchema.pre("save", async function (next) {
  // Skip hashing if password hasn't changed or doesn't exist
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  // Generate salt and hash password
  const salt = await bcrypt.genSalt(10); // 10 salt rounds
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * User Model
 *
 * Mongoose model for user documents.
 * Used for CRUD operations on user data.
 */
const UserModel = model<IUserDocument>("User", userSchema);
export default UserModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Authentication Hub
 *    This model supports two authentication flows: email/password and Google OAuth.
 *    The `authProvider` enum determines which flow a user signed up with, and the
 *    `password` field is optional to accommodate OAuth-only users who never set a password.
 *
 * 2. Security by Default
 *    Sensitive fields (password, emailVerificationToken, twoFactorSecret,
 *    twoFactorPendingSecret, twoFactorBackupCodes) all use `select: false` so they
 *    are excluded from query results by default. Controllers must explicitly use
 *    `.select('+password')` when they need these fields (e.g., during login).
 *
 * 3. Automatic Password Hashing
 *    The pre-save middleware uses bcrypt with 10 salt rounds to hash passwords
 *    before they reach the database. It only hashes when the password field is
 *    modified, preventing double-hashing on unrelated document updates.
 *
 * 4. Two-Factor Authentication (2FA)
 *    The 2FA flow uses a two-phase setup: `twoFactorPendingSecret` holds the TOTP
 *    secret during setup (before the user confirms with a code), and `twoFactorSecret`
 *    holds the active secret after confirmation. Backup codes provide account recovery
 *    if the user loses their authenticator device.
 *
 * 5. Email Verification
 *    The `emailVerificationToken` and `emailVerificationTokenExpires` fields support
 *    a time-limited token-based email verification flow. These are excluded from
 *    default queries to prevent token leakage.
 *
 * 6. Referral System
 *    The `pendingReferralCode` and `referralRedeemedAt` fields track a basic referral
 *    workflow: a code is stored when provided during signup and marked as redeemed
 *    once validated.
 *
 * 7. Relationships
 *    - Referenced by: Organization.createdByUserId, Transaction.userId,
 *      ChatSession.userId, ChatMessage.userId, Account.createdByUserId
 *    - This model is the identity anchor for the entire system.
 *
 * =============================================================================
 */
