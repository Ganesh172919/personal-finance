import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import SubscriptionModel from "../models/subscriptionModel";
import OrgMemberModel from "../models/orgMemberModel";
import UserModel from "../models/userModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const PASSWORD = "Initial-Pass1";

describe("auth account endpoints: validation + role escalation", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let userId = "";

  const sign = (id: string) => `jwt=${jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: "1d" })}`;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const user = await UserModel.create({
      email: `acct+${Date.now()}@example.com`,
      name: "Account User",
      password: PASSWORD,
      authProvider: "email",
      isEmailVerified: true,
    });
    userId = user._id.toString();
    cookie = sign(userId);
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  const put = (body: unknown) =>
    request(app).put("/api/auth/profile").set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send(body as object);
  const changePw = (body: unknown) =>
    request(app).post("/api/auth/password").set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrfToken).send(body as object);

  it("POST /auth/password with missing fields returns 400, not 500", async () => {
    const res = await changePw({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/password enforces the registration password policy", async () => {
    const res = await changePw({ currentPassword: PASSWORD, newPassword: "alllowercase" });
    expect(res.status).toBe(400);
    const stored = await UserModel.findById(userId).select("+password");
    // Password unchanged: old password still works.
    const ok = await (await import("bcryptjs")).default.compare(PASSWORD, String(stored?.password));
    expect(ok).toBe(true);
  });

  it("POST /auth/password succeeds with a strong new password and rejects a wrong current one", async () => {
    await changePw({ currentPassword: "Wrong-Pass1", newPassword: "Another-Pass2" }).expect(401);
    await changePw({ currentPassword: PASSWORD, newPassword: "Another-Pass2" }).expect(200);
  });

  it("PUT /auth/profile rejects non-string names and malformed phone numbers", async () => {
    expect((await put({ name: { $gt: "" } })).status).toBe(400);
    expect((await put({ phoneNumber: "abc<script>" })).status).toBe(400);
    const user = await UserModel.findById(userId).lean();
    expect(user?.name).toBe("Account User");
    expect((user as any)?.phoneNumber).toBeUndefined();
  });

  it("PUT /auth/profile keeps the Settings contract and ignores identity fields", async () => {
    const original = await UserModel.findById(userId).lean();
    const res = await put({
      name: "  New Name ",
      email: "hijack@example.com",
      phoneNumber: "+1 (555) 123-4567",
      authProvider: "google",
      isEmailVerified: false,
    }).expect(200);
    expect(res.body.user.name).toBe("New Name");
    expect(res.body.user.phoneNumber).toBe("+15551234567");
    const user = await UserModel.findById(userId).lean();
    expect(user?.email).toBe(original?.email);
    expect(user?.authProvider).toBe("email");
    expect(user?.isEmailVerified).toBe(true);

    // Empty phone clears it.
    const cleared = await put({ phoneNumber: "" }).expect(200);
    expect(cleared.body.user.phoneNumber).toBeNull();
  });

  it("an org admin cannot grant the owner role", async () => {
    const owner = await UserModel.findById(userId);
    const personal = await ensurePersonalOrgForUser(owner!._id);
    const orgId = personal.orgId as mongoose.Types.ObjectId;
    await EntitlementModel.findOneAndUpdate(
      { orgId },
      { $set: { orgId, userId: owner!._id, plan: "team", status: "active" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await SubscriptionModel.findOneAndUpdate(
      { orgId },
      { $set: { orgId, provider: "stub", planTier: "team", status: "active", seats: 5 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const admin = await UserModel.create({ email: "admin@example.com", name: "Admin", authProvider: "email", isEmailVerified: true });
    await OrgMemberModel.create({ orgId, userId: admin._id, role: "admin", status: "active", isDefault: false });
    const adminCookie = sign(admin._id.toString());

    const escalate = await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set("Cookie", [adminCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "accomplice@example.com", role: "owner" });
    expect(escalate.status).toBe(403);
    expect(escalate.body.code).toBe("ORG_ROLE_ESCALATION");

    // Admins can still invite members; owners can still grant owner.
    await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set("Cookie", [adminCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "member@example.com", role: "member" })
      .expect(201);
    await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "coowner@example.com", role: "owner" })
      .expect(201);
  }, 20_000);
});
