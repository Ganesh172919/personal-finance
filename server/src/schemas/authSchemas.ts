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

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().email("Invalid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, "Password must include upper, lower, and numeric characters"),
    phoneNumber: z.string().trim().regex(phoneRegex, "Invalid phone number").optional(),
    referralCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, "Referral code must be 6-16 alphanumeric characters")
      .optional()
  })
  .strict();

export const loginBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email"),
    password: z.string().min(1, "Password is required").max(128)
  })
  .strict();

export const verifyEmailBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email"),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits")
  })
  .strict();

export const resendVerificationBodySchema = z
  .object({
    email: z.string().trim().email("Invalid email")
  })
  .strict();
