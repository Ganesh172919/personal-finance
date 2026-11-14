import passport from "passport";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Fake (non-secret) credentials: enough to register the strategy. No network is ever used.
const { TEST_CLIENT_URL } = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.AUTH_RATE_LIMIT_MAX = "1000";
  process.env.GOOGLE_CALLBACK_URL = ""; // empty beats any value dotenv would load from a local server/.env
  return { TEST_CLIENT_URL: "http://localhost:5173" };
});

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import OrgMemberModel from "../models/orgMemberModel";
import UserModel from "../models/userModel";
import { getGoogleCallbackUrl } from "../services/googleOAuth";
import { generateCurrentTotp, generateTotpSecret } from "../services/totp";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

interface FakeProfile {
  id: string;
  displayName: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos: Array<{ value: string }>;
}

const makeProfile = (overrides: Partial<FakeProfile> = {}): FakeProfile => ({
  id: "google-sub-1",
  displayName: "Grace Hopper",
  emails: [{ value: "grace@example.com", verified: true }],
  photos: [{ value: "https://example.com/p.png" }],
  ...overrides,
});

describe("Google OAuth sign-in", () => {
  const app = createApp();
  let profile: FakeProfile;
  let tokenExchangeError: Error | null = null;
  let seenCodeVerifier: string | undefined;
  const savedId = process.env.GOOGLE_CLIENT_ID;
  const savedSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    // Hermetic: stub the two network calls the strategy makes (token exchange + userinfo).
    const strategy = (passport as any)._strategy("google");
    strategy._oauth2.getOAuthAccessToken = (_code: string, params: any, cb: any) => {
      seenCodeVerifier = params.code_verifier;
      if (tokenExchangeError) return cb(tokenExchangeError);
      cb(null, "fake-access-token", "fake-refresh-token", {});
    };
    strategy.userProfile = (_token: string, done: any) => done(null, profile);
  });

  afterAll(async () => {
    process.env.GOOGLE_CLIENT_ID = savedId;
    process.env.GOOGLE_CLIENT_SECRET = savedSecret;
    await stopTestDb();
  });

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = savedId;
    process.env.GOOGLE_CLIENT_SECRET = savedSecret;
    await clearTestDb();
    profile = makeProfile();
    tokenExchangeError = null;
    seenCodeVerifier = undefined;
  });

  /** Runs leg 1 and returns the state + cookie header Google would round-trip. */
  const startFlow = async (query = "") => {
    const res = await request(app).get(`/api/auth/google${query}`).expect(302);
    const location = new URL(res.headers.location as string);
    const cookieHeader = ((res.headers["set-cookie"] as unknown as string[]) || [])
      .map(c => c.split(";")[0])
      .find(c => c.startsWith("fw_oauth_state="));
    return { location, state: location.searchParams.get("state") as string, cookie: cookieHeader as string, res };
  };

  const callback = (state: string | undefined, cookie: string | undefined, extra = "") =>
    request(app)
      .get(`/api/auth/google/callback?code=fake-code${state ? `&state=${encodeURIComponent(state)}` : ""}${extra}`)
      .set("Cookie", cookie ? [cookie] : []);

  const cookieNames = (res: request.Response) =>
    ((res.headers["set-cookie"] as unknown as string[]) || []).map(c => c.split("=")[0]);

  it("GET /auth/providers reflects configuration", async () => {
    const on = await request(app).get("/api/auth/providers").expect(200);
    expect(on.body).toMatchObject({ email: true, google: true });
    const v1 = await request(app).get("/api/v1/auth/providers").expect(200);
    expect(v1.body.google).toBe(true);

    delete process.env.GOOGLE_CLIENT_ID;
    const off = await request(app).get("/api/auth/providers").expect(200);
    expect(off.body).toMatchObject({ email: true, google: false });
    const start = await request(app).get("/api/auth/google");
    expect(start.status).toBe(501);
    expect(start.body.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("derives the callback URL from CLIENT_URL when GOOGLE_CALLBACK_URL is unset", () => {
    expect(getGoogleCallbackUrl()).toBe(`${TEST_CLIENT_URL}/api/auth/google/callback`);
    process.env.GOOGLE_CALLBACK_URL = "https://app.example.com/api/auth/google/callback";
    expect(getGoogleCallbackUrl()).toBe("https://app.example.com/api/auth/google/callback");
    process.env.GOOGLE_CALLBACK_URL = "";
  });

  it("starts the flow with state + PKCE and a signed httpOnly state cookie", async () => {
    const { location, state, res } = await startFlow();
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe(`${TEST_CLIENT_URL}/api/auth/google/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("scope")).toContain("email");
    expect(state.length).toBeGreaterThan(16);
    const raw = (res.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("fw_oauth_state="))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Max-Age=600/i);
  });

  it("creates a new user + personal org and issues the session cookies", async () => {
    const { state, cookie } = await startFlow();
    const res = await callback(state, cookie).expect(302);

    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/dashboard`);
    expect(seenCodeVerifier).toBeTruthy();
    expect(cookieNames(res)).toEqual(expect.arrayContaining(["jwt", "csrf_token", "fw_oauth_state"]));

    const user = await UserModel.findOne({ email: "grace@example.com" });
    expect(user).toBeTruthy();
    expect(user!.authProvider).toBe("google");
    expect(user!.googleId).toBe("google-sub-1");
    expect(user!.isEmailVerified).toBe(true);
    expect(await OrgMemberModel.countDocuments({ userId: user!._id, role: "owner", status: "active" })).toBe(1);

    // The jwt cookie from the callback authenticates /auth/profile exactly like an e-mail login.
    const jwtCookie = (res.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("jwt="))!.split(";")[0];
    const me = await request(app).get("/api/auth/profile").set("Cookie", [jwtCookie]).expect(200);
    expect(me.body.email).toBe("grace@example.com");
  });

  it("requires 2FA after Google OAuth, expires the challenge, and consumes it only once", async () => {
    const secret = generateTotpSecret();
    await UserModel.create({ email: "grace@example.com", name: "Grace", googleId: "google-sub-1",
      authProvider: "google", isEmailVerified: true, twoFactorEnabled: true, twoFactorSecret: secret });
    const flow = await startFlow("?next=/analytics");
    const res = await callback(flow.state, flow.cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?mfa=required`);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find(c => c.startsWith("jwt="))).toMatch(/Expires=Thu, 01 Jan 1970/);
    const challenge = cookies.find(c => c.startsWith("fw_2fa_challenge="))!.split(";")[0];
    const csrf = cookies.find(c => c.startsWith("csrf_token="))!.split(";")[0];
    const csrfToken = decodeURIComponent(csrf.split("=")[1]);
    await request(app).get("/api/auth/profile").set("Cookie", [challenge]).expect(401);
    const complete = (code: string, token = challenge) => request(app).post("/api/auth/2fa/complete")
      .set("Cookie", [token, csrf]).set("X-CSRF-Token", csrfToken).send({ code });
    await complete("00000000").expect(401);
    const code = generateCurrentTotp(secret);
    const success = await complete(code).expect(200);
    expect(success.body.next).toBe("/analytics");
    const jwtCookie = (success.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("jwt="))!.split(";")[0];
    await request(app).get("/api/auth/profile").set("Cookie", [jwtCookie]).expect(200);
    await complete(code).expect(401);
    const invalid = await complete(code, `${challenge}tampered`).expect(401);
    expect(invalid.body.code).toBe("INVALID_CHALLENGE");
    const expired = jwt.sign({ purpose: "oauth_2fa", sub: "507f1f77bcf86cd799439011", nonce: "a".repeat(64) },
      process.env.JWT_SECRET as string, { expiresIn: -1 });
    const expiredResponse = await complete(code, `fw_2fa_challenge=${expired}`).expect(401);
    expect(expiredResponse.body.code).toBe("INVALID_CHALLENGE");
  });

  it("honours a sanitised ?next= and ignores open-redirect attempts", async () => {
    let flow = await startFlow(`?next=${encodeURIComponent("/analytics?tab=1")}`);
    let res = await callback(flow.state, flow.cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/analytics?tab=1`);

    for (const evil of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com"]) {
      flow = await startFlow(`?next=${encodeURIComponent(evil)}`);
      res = await callback(flow.state, flow.cookie).expect(302);
      expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/dashboard`);
    }
  });

  it("links an existing e-mail account when Google reports the e-mail as verified", async () => {
    const existing = await UserModel.create({
      email: "grace@example.com",
      name: "Grace",
      password: "Initial-Pass1",
      authProvider: "email",
      isEmailVerified: true,
    });
    const { state, cookie } = await startFlow();
    const res = await callback(state, cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/dashboard`);

    expect(await UserModel.countDocuments({ email: "grace@example.com" })).toBe(1);
    const linked = await UserModel.findById(existing._id).select("+password");
    expect(linked!.googleId).toBe("google-sub-1");
    expect(linked!.authProvider).toBe("email");
    expect(linked!.password).toBeTruthy(); // verified owner keeps password login
  });

  it("drops unproven credentials when linking a never-verified e-mail account", async () => {
    const squatted = await UserModel.create({
      email: "grace@example.com",
      name: "Squatter",
      password: "Attacker-Pass1",
      authProvider: "email",
      isEmailVerified: false,
    });
    const { state, cookie } = await startFlow();
    await callback(state, cookie).expect(302);

    const after = await UserModel.findById(squatted._id).select("+password");
    expect(after!.googleId).toBe("google-sub-1");
    expect(after!.isEmailVerified).toBe(true);
    expect(after!.authProvider).toBe("google");
    expect(after!.password).toBeUndefined();
  });

  it("rejects a Google e-mail that is not verified (no user, no session)", async () => {
    profile = makeProfile({ emails: [{ value: "grace@example.com", verified: false }] });
    const { state, cookie } = await startFlow();
    const res = await callback(state, cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_unverified_email`);
    expect(cookieNames(res)).not.toContain("jwt");
    expect(await UserModel.countDocuments({})).toBe(0);
  });

  it("does not link an account already bound to a different Google id", async () => {
    await UserModel.create({
      email: "grace@example.com",
      name: "Grace",
      googleId: "someone-else",
      authProvider: "google",
      isEmailVerified: true,
    });
    const { state, cookie } = await startFlow();
    const res = await callback(state, cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_account_conflict`);
    expect(cookieNames(res)).not.toContain("jwt");
  });

  it("rejects a state mismatch, a missing state cookie and a tampered cookie", async () => {
    const flow = await startFlow();

    let res = await callback("not-the-state", flow.cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_state_invalid`);
    expect(cookieNames(res)).not.toContain("jwt");

    res = await callback(flow.state, undefined).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_state_invalid`);

    res = await callback(flow.state, `${flow.cookie}x`).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_state_invalid`);

    // A state from one browser cannot be replayed with another browser's cookie.
    const other = await startFlow();
    res = await callback(flow.state, other.cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_state_invalid`);
    expect(await UserModel.countDocuments({})).toBe(0);
  });

  it("redirects with google_denied when the user cancels at Google", async () => {
    const res = await request(app).get("/api/auth/google/callback?error=access_denied").expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_denied`);
    const bare = await request(app).get("/api/auth/google/callback").expect(302);
    expect(bare.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_failed`);
  });

  it("redirects with google_failed when the token exchange fails", async () => {
    tokenExchangeError = new Error("boom");
    const { state, cookie } = await startFlow();
    const res = await callback(state, cookie).expect(302);
    expect(res.headers.location).toBe(`${TEST_CLIENT_URL}/login?error=google_failed`);
    expect(cookieNames(res)).not.toContain("jwt");
  });

  it("a Google-only account cannot sign in with a password", async () => {
    await UserModel.create({
      email: "grace@example.com",
      name: "Grace",
      googleId: "google-sub-1",
      authProvider: "google",
      isEmailVerified: true,
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "grace@example.com", password: "Whatever-Pass1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("GOOGLE_AUTH_REQUIRED");
  });
});
