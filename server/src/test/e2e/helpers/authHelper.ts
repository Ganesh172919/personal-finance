/**
 * @fileoverview Test Authentication & Tenant Isolation Helper for E2E Voice Testing.
 *
 * Provides fast in-memory user provisioning, JWT cookie generation, CSRF token
 * double-submit acquisition, and organization scoping context to authenticate
 * Supertest requests against Express createApp().
 *
 * @module test/e2e/helpers/authHelper
 */

import type { Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";

import UserModel, { type IUserDocument } from "../../../models/userModel";
import { resolveDefaultOrgForUser } from "../../../services/orgService";

export interface AuthedSession {
  user: IUserDocument;
  userId: string;
  orgId: string;
  jwtToken: string;
  authCookie: string;
  csrfCookie: string;
  csrfToken: string;
  cookies: string[];
  headers: Record<string, string>;
  applyAuth: (req: request.Test) => request.Test;
}

const randomSuffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Fetches double-submit CSRF cookie and token from the running application instance.
 */
export async function getCsrfTokens(app: Express): Promise<{ csrfCookie: string; csrfToken: string }> {
  const res = await request(app).get("/api/auth/csrf").expect(200);
  const setCookie = res.headers["set-cookie"];
  const csrfCookieHeader = Array.isArray(setCookie) ? setCookie[0] : (setCookie || "");
  const csrfCookie = csrfCookieHeader.split(";")[0] || "";
  const csrfToken = (res.body?.csrf_token as string) || "";
  return { csrfCookie, csrfToken };
}

/**
 * Generates a signed JWT token string for a given user ID using test JWT_SECRET.
 */
export function createMockJwtToken(userId: string): string {
  const secret = process.env.JWT_SECRET || "test-jwt-secret";
  return jwt.sign({ id: userId }, secret, { expiresIn: "1d" });
}

/**
 * Generates the "jwt=<token>" cookie string required by Passport CachedJwtStrategy.
 */
export function createMockJwtCookie(userId: string): string {
  const token = createMockJwtToken(userId);
  return `jwt=${token}`;
}

/**
 * Creates an authenticated user with default organization and returns an AuthedSession
 * equipped with full credentials and an applyAuth() helper for Supertest requests.
 */
export async function createAuthedSession(
  app: Express,
  params?: { email?: string; name?: string }
): Promise<AuthedSession> {
  const email = params?.email || `voice.tester+${randomSuffix()}@finwise.bharat`;
  const name = params?.name || "FinWise Bharat Voice Tester";

  // 1. Create User in MongoDB
  const user = await UserModel.create({
    email,
    name,
    authProvider: "email",
    isEmailVerified: true,
  });

  const userId = user._id.toString();

  // 2. Resolve or provision default organization
  const defaultOrg = await resolveDefaultOrgForUser(new mongoose.Types.ObjectId(userId));
  const orgId = defaultOrg.orgId.toString();

  // 3. Obtain CSRF double-submit token
  const { csrfCookie, csrfToken } = await getCsrfTokens(app);

  // 4. Generate JWT cookie
  const jwtToken = createMockJwtToken(userId);
  const authCookie = `jwt=${jwtToken}`;
  const cookies = [authCookie, csrfCookie];

  const headers: Record<string, string> = {
    Cookie: cookies.join("; "),
    "x-csrf-token": csrfToken,
    "x-org-id": orgId,
  };

  const applyAuth = (req: request.Test): request.Test => {
    return req
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId);
  };

  return {
    user,
    userId,
    orgId,
    jwtToken,
    authCookie,
    csrfCookie,
    csrfToken,
    cookies,
    headers,
    applyAuth,
  };
}
