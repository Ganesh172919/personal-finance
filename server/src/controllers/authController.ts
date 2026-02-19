import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import UserModel, { IUserDocument } from "../models/userModel";
import { sendEmail } from "../utils/sendEmail";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";

const buildCookieOptions = (env: ReturnType<typeof getEnv>, maxAgeMs: number) => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  domain: env.COOKIE_DOMAIN,
  maxAge: maxAgeMs,
  path: "/",
});

// Helper function to generate and set the JWT cookie
const generateAndSetToken = (res: Response, userId: string) => {
  const env = getEnv();
  const token = jwt.sign({ id: userId }, env.JWT_SECRET, {
    expiresIn: "1d",
  });
  res.cookie("jwt", token, buildCookieOptions(env, 24 * 60 * 60 * 1000));
};

export const getCsrfToken = async (req: Request, res: Response) => {
  const env = getEnv();
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie(env.CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
    maxAge: 2 * 60 * 60 * 1000,
    path: "/",
  });

  res.status(200).json({ csrf_token: token, request_id: req.requestId });
};

// --- Register a new user ---
export const register = async (req: Request, res: Response) => {
  const env = getEnv();
  const { name, email, password, phoneNumber, referralCode } = req.body as {
    name: string;
    email: string;
    password: string;
    phoneNumber?: string;
    referralCode?: string;
  };

  const userExists = await UserModel.findOne({ email }).select("_id").lean();
  if (userExists) {
    throw new HttpError(400, "USER_EXISTS", "User with this email already exists");
  }

  const newUser = await UserModel.create({
    name,
    email,
    password,
    phoneNumber,
    authProvider: "email",
    pendingReferralCode: referralCode ? String(referralCode).trim().toUpperCase() : undefined,
  });

  const verificationToken = crypto.randomInt(100000, 999999).toString();
  newUser.emailVerificationToken = verificationToken;
  newUser.emailVerificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
  await newUser.save();

  const emailResult = await sendEmail({
    to: email,
    subject: "Your FinWise Email Verification Code",
    text: `Your verification code is: ${verificationToken}`,
    html: `<p>Your verification code is: <strong>${verificationToken}</strong></p>`,
  });
  const smokeTestMode = req.header("x-smoke-test") === "1";

  res.status(201).json({
    message: "Registration successful. Please check your email for a verification code.",
    request_id: req.requestId,
    dev_otp:
      env.NODE_ENV !== "production" && (emailResult.mode === "console" || smokeTestMode)
        ? verificationToken
        : undefined,
  });
};

// --- Verify User's Email with OTP ---
export const verifyEmail = async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email: string; otp: string };

  const user = await UserModel.findOne({
    email,
    emailVerificationToken: otp,
    emailVerificationTokenExpires: { $gt: Date.now() },
  }).select("+emailVerificationToken +emailVerificationTokenExpires");

  if (!user) {
    throw new HttpError(400, "INVALID_OTP", "Invalid or expired OTP.");
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpires = undefined;
  await user.save();

  generateAndSetToken(res, user._id.toString());
  res.status(200).json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    request_id: req.requestId,
  });
};

// --- Resend the Verification OTP ---
export const resendVerification = async (req: Request, res: Response) => {
  const env = getEnv();
  const { email } = req.body as { email: string };

  const user = await UserModel.findOne({
    email,
    authProvider: "email",
    isEmailVerified: false,
  }).select("+emailVerificationToken +emailVerificationTokenExpires");

  if (!user) {
    throw new HttpError(400, "USER_NOT_FOUND", "User not found or has already been verified.");
  }

  const verificationToken = crypto.randomInt(100000, 999999).toString();
  user.emailVerificationToken = verificationToken;
  user.emailVerificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  const emailResult = await sendEmail({
    to: email,
    subject: "Your New FinWise Verification Code",
    text: `Your new verification code is: ${verificationToken}`,
    html: `<p>Your new verification code is: <strong>${verificationToken}</strong></p>`,
  });
  const smokeTestMode = req.header("x-smoke-test") === "1";

  res.status(200).json({
    message: "Verification code resent successfully.",
    request_id: req.requestId,
    dev_otp:
      env.NODE_ENV !== "production" && (emailResult.mode === "console" || smokeTestMode)
        ? verificationToken
        : undefined,
  });
};

// --- Login with Email & Password ---
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await UserModel.findOne({ email, authProvider: "email" }).select("+password");
  if (!user || !user.password) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }
  if (!user.isEmailVerified) {
    throw new HttpError(401, "EMAIL_NOT_VERIFIED", "Please verify your email first.");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }

  generateAndSetToken(res, user._id.toString());
  res.status(200).json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    request_id: req.requestId,
  });
};

// --- Google OAuth Callback ---
export const getGoogleCallback = (req: Request, res: Response) => {
  const user = req.user as IUserDocument; 
  generateAndSetToken(res, user._id.toString());
  const clientUrl = getEnv().CLIENT_URL.replace(/\/$/, "");
  res.redirect(`${clientUrl}/chat`);
};

// --- Get Current User's Profile ---
export const getProfile = (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  res.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    request_id: req.requestId,
  });
};

// --- Logout ---
export const logout = (req: Request, res: Response) => {
  const env = getEnv();
  res.clearCookie("jwt", {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
    path: "/",
  });
  res.status(200).json({ message: "Logged out successfully", request_id: req.requestId });
};
