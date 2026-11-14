import request from "supertest";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import UserModel from "../models/userModel";
import { generateCurrentTotp, generateTotpSecret, hashBackupCode } from "../services/totp";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const password = "Initial-Pass1";
const app = createApp();

describe("password sign-in with enabled 2FA", () => {
  let secret: string;
  let csrfCookie: string;
  let csrfToken: string;
  const login = (body: object) => request(app).post("/api/auth/login")
    .set("Cookie", [csrfCookie]).set("X-CSRF-Token", csrfToken).send(body);
  const credentials = { email: "mfa@example.com", password };

  beforeAll(async () => { await startTestDb(); configurePassport(); });
  afterAll(async () => { await stopTestDb(); });
  beforeEach(async () => {
    await clearTestDb();
    secret = generateTotpSecret();
    await UserModel.create({ ...credentials, name: "MFA User", authProvider: "email", isEmailVerified: true,
      twoFactorEnabled: true, twoFactorSecret: secret, twoFactorBackupCodes: [hashBackupCode("AAAA-BBBB")] });
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = csrf.headers["set-cookie"][0].split(";")[0];
    csrfToken = csrf.body.csrf_token;
  });

  it("withholds a session until the TOTP is verified and prevents reuse of that time step", async () => {
    const incomplete = await login(credentials).expect(202);
    expect(incomplete.body.two_factor_required).toBe(true);
    expect(((incomplete.headers["set-cookie"] as unknown as string[]) || []).some((c: string) => /^jwt=.*Max-Age=[1-9]/.test(c))).toBe(false);
    await request(app).get("/api/auth/profile").set("Cookie", [csrfCookie]).expect(401);
    const invalid = await login({ ...credentials, twoFactorCode: "00000000" }).expect(401);
    expect(invalid.body.code).toBe("INVALID_SECOND_FACTOR");
    expect(((invalid.headers["set-cookie"] as unknown as string[]) || []).some((c: string) => /^jwt=.*Max-Age=[1-9]/.test(c))).toBe(false);
    const code = generateCurrentTotp(secret);
    const complete = await login({ ...credentials, twoFactorCode: code }).expect(200);
    const jwtCookie = (complete.headers["set-cookie"] as unknown as string[]).find((c: string) => c.startsWith("jwt="))!.split(";")[0];
    await request(app).get("/api/auth/profile").set("Cookie", [jwtCookie]).expect(200);
    await login({ ...credentials, twoFactorCode: code }).expect(401);
  });

  it("consumes a recovery code only once across concurrent sign-ins", async () => {
    const [a, b] = await Promise.all([
      login({ ...credentials, twoFactorCode: "AAAA-BBBB" }),
      login({ ...credentials, twoFactorCode: "AAAABBBB" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    await login({ ...credentials, twoFactorCode: "AAAA-BBBB" }).expect(401);
  });

  it("revokes pre-enrollment sessions even if another replica cached the user", async () => {
    const user = await UserModel.findOne({ email: credentials.email });
    await UserModel.updateOne({ _id: user!._id }, { $set: { twoFactorEnabled: false } });
    const old = `jwt=${jwt.sign({ id: String(user!._id) }, process.env.JWT_SECRET as string)}`;
    await request(app).get("/api/auth/profile").set("Cookie", [old]).expect(200);
    // Native update models a write on a different replica without local cache invalidation.
    await UserModel.collection.updateOne({ _id: user!._id }, { $set: { twoFactorEnabled: true } });
    await request(app).get("/api/auth/profile").set("Cookie", [old]).expect(401);
  });

  it("enrollment rotates the session and invalidates its setup code", async () => {
    const user = await UserModel.findOne({ email: credentials.email });
    await UserModel.updateOne({ _id: user!._id }, { $set: { twoFactorEnabled: false },
      $unset: { twoFactorSecret: 1, twoFactorLastCounter: 1 } });
    const old = `jwt=${jwt.sign({ id: String(user!._id) }, process.env.JWT_SECRET as string)}`;
    const setup = await request(app).post("/api/v1/auth/2fa/setup")
      .set("Cookie", [old, csrfCookie]).set("X-CSRF-Token", csrfToken).expect(200);
    const setupCode = generateCurrentTotp(setup.body.secret);
    const verified = await request(app).post("/api/v1/auth/2fa/verify")
      .set("Cookie", [old, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ token: setupCode }).expect(200);
    const fresh = (verified.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("jwt="))!.split(";")[0];
    await request(app).get("/api/v1/auth/2fa/status").set("Cookie", [fresh]).expect(200);
    await request(app).get("/api/auth/profile").set("Cookie", [old]).expect(401);
    await login({ ...credentials, twoFactorCode: setupCode }).expect(401);

    const disabled = await request(app).post("/api/v1/auth/2fa/disable")
      .set("Cookie", [fresh, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ token: verified.body.backup_codes[0] }).expect(200);
    const disabledCookie = (disabled.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("jwt="))!.split(";")[0];
    await request(app).get("/api/auth/profile").set("Cookie", [fresh]).expect(401);
    await request(app).get("/api/auth/profile").set("Cookie", [disabledCookie]).expect(200);

    const newSetup = await request(app).post("/api/v1/auth/2fa/setup")
      .set("Cookie", [disabledCookie, csrfCookie]).set("X-CSRF-Token", csrfToken).expect(200);
    const reenrolled = await request(app).post("/api/v1/auth/2fa/verify")
      .set("Cookie", [disabledCookie, csrfCookie]).set("X-CSRF-Token", csrfToken)
      .send({ token: generateCurrentTotp(newSetup.body.secret) }).expect(200);
    const reenrolledCookie = (reenrolled.headers["set-cookie"] as unknown as string[]).find(c => c.startsWith("jwt="))!.split(";")[0];
    await request(app).get("/api/auth/profile").set("Cookie", [fresh]).expect(401);
    await request(app).get("/api/auth/profile").set("Cookie", [disabledCookie]).expect(401);
    await request(app).get("/api/auth/profile").set("Cookie", [reenrolledCookie]).expect(200);
  });

  it("rejects wrong passwords even when the second factor is valid", async () => {
    await login({ ...credentials, password: "wrong", twoFactorCode: generateCurrentTotp(secret) }).expect(401);
    const ok = await login({ ...credentials, twoFactorCode: generateCurrentTotp(secret) }).expect(200);
    expect((ok.headers["set-cookie"] as unknown as string[]).some((c: string) => c.startsWith("jwt="))).toBe(true);
  });
});
