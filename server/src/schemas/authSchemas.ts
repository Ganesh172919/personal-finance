/**
 * @fileoverview Zod validation schemas for authentication request bodies.
 *
 * Exported schemas:
 *   registerBodySchema          - Validates user registration (name, email, password, phone, referral code)
 *   loginBodySchema             - Validates login credentials (email, password)
 *   verifyEmailBodySchema       - Validates email verification (email + 6-digit OTP)
 *   resendVerificationBodySchema - Validates resend verification request (email only)
 *
 * Used by: authRoutes
 *
 * Key validation rules:
 *   - Password: 8-128 chars, must include uppercase, lowercase, and digit
 *   - Email: standard email format validation
 *   - OTP: exactly 6 digits
 *   - Referral code: 6-16 alphanumeric characters (uppercased)
 *   - Phone number: optional, 10-15 digits with optional leading +
 *   - All schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

const phoneRegex = /^[+]?[0-9]{10,15}$/;

/** Shared password policy for registration and password changes. */
// Defines a password complexity schema enforcing entropy standards.
// Requires at least 8 characters including uppercase, lowercase, and numeric digits.
// Protects authentication endpoints against trivial or easily guessable passwords.
const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, "Password must include upper, lower, and numeric characters");

// Validates incoming HTTP request payloads for new user registrations.
// Enforces valid email formats, strong password standards, and optional referral codes.
// Rejects unexpected payload attributes using strict schema verification.
export const registerBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().email("Invalid email"),
    password: strongPasswordSchema,
    phoneNumber: z.string().trim().regex(phoneRegex, "Invalid phone number").optional(),
    referralCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, "Referral code must be 6-16 alphanumeric characters")
      .optional()
  })
  .strict();

// Validates two-factor authentication inputs including TOTP codes and recovery keys.
// Accepts standard 6-digit numeric codes or formatted hexadecimal backup tokens.
// Enforces strict pattern matching before dispatching to verification logic.
export const secondFactorCodeSchema = z.string().trim().regex(/^(?:\d{6}|[a-fA-F0-9]{4}-?[a-fA-F0-9]{4})$/, "Enter a six-digit code or recovery code");

// Validates user credentials submitted to the authentication login endpoint.
// Enforces presence of email, password, and optional second-factor security codes.
// Rejects extraneous unknown request fields to prevent parameter tampering.
export const loginBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email"),
    password: z.string().min(1, "Password is required").max(128),
    twoFactorCode: secondFactorCodeSchema.optional(),
  })
  .strict();

// Validates the confirmation payload required to finalize OAuth login with 2FA.
// Enforces a valid six-digit TOTP code or hexadecimal recovery token.
// Rejects unauthorized parameters to protect multi-step OAuth challenge flows.
export const completeOAuth2FABodySchema = z.object({ code: secondFactorCodeSchema }).strict();

// Validates email verification payloads containing one-time email confirmation codes.
// Requires a valid email address and an exact 6-digit numeric verification OTP.
// Ensures strict data formatting before updating email verification state.
export const verifyEmailBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email"),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits")
  })
  .strict();

// Validates requests to generate and resend email verification OTP messages.
// Enforces presence and syntax correctness of the target account email address.
// Rejects extraneous parameters using strict schema evaluation.
export const resendVerificationBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email")
  })
  .strict();

/**
 * PUT /auth/profile body. Only name and phoneNumber are mutable; `email` is
 * accepted (the Settings form sends it) but ignored by the controller. Unknown
 * keys are stripped so identity fields (role, orgId, authProvider…) can never
 * be mass-assigned. An empty phoneNumber clears the stored value.
 */
// Validates user profile updates for mutable display name and phone fields.
// Cleans phone numbers by stripping punctuation and validating digit length.
// Strips unknown keys to prevent mass-assignment attacks on user identity fields.
export const updateProfileBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  email: z.string().optional(),
  phoneNumber: z
    .string()
    .max(32)
    .transform((value) => value.trim().replace(/[\s().-]/g, ""))
    .refine((value) => value === "" || phoneRegex.test(value), "Invalid phone number")
    .optional(),
});

// Validates password change requests for authenticated user accounts.
// Enforces presence of current password and validates new password complexity.
// Rejects extraneous properties using strict schema verification.
export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: strongPasswordSchema,
  })
  .strict();
