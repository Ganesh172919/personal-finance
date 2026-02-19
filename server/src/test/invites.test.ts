import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import SubscriptionModel from "../models/subscriptionModel";
import UserModel from "../models/userModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";
import { createAuthedUser } from "./authHelpers";

describe("org invites + audit API", () => {
  const app = createApp();
  let ownerCookie = "";
  let ownerUserId = "";
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    ownerCookie = auth.cookie;
    ownerUserId = auth.user._id.toString();
    const personalOrg = await ensurePersonalOrgForUser(auth.user._id);
    const personalOrgId = personalOrg.orgId as any;

    await Promise.all([
      EntitlementModel.findOneAndUpdate(
        { orgId: personalOrgId },
        {
          $set: {
            orgId: personalOrgId,
            userId: new mongoose.Types.ObjectId(ownerUserId),
            plan: "team",
            status: "active",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      SubscriptionModel.findOneAndUpdate(
        { orgId: personalOrgId },
        {
          $set: {
            orgId: personalOrgId,
            provider: "stub",
            planTier: "team",
            status: "active",
            seats: 5,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
    ]);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("creates invite for unknown email, accepts it, and records audit events", async () => {
    const createdOrg = await request(app)
      .post("/api/v1/orgs")
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Team Alpha" })
      .expect(201);

    const orgId = createdOrg.body.org?.id as string;
    expect(orgId).toMatch(/^[a-f\d]{24}$/i);

    await Promise.all([
      EntitlementModel.findOneAndUpdate(
        { orgId },
        {
          $set: {
            orgId,
            userId: new mongoose.Types.ObjectId(ownerUserId),
            plan: "team",
            status: "active",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      SubscriptionModel.findOneAndUpdate(
        { orgId },
        {
          $set: {
            orgId,
            provider: "stub",
            planTier: "team",
            status: "active",
            seats: 5,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
    ]);

    const inviteRes = await request(app)
      .post(`/api/v1/orgs/${orgId}/members`)
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "invitee@example.com", role: "member" })
      .expect(201);

    expect(inviteRes.body.member).toBeNull();
    expect(inviteRes.body.invite?.email).toBe("invitee@example.com");
    expect(inviteRes.body.invite?.status).toBe("pending");
    expect(inviteRes.body.invite?.token).toBeTruthy();

    const inviteToken = inviteRes.body.invite.token as string;

    const invitee = await UserModel.create({
      email: "invitee@example.com",
      name: "Invitee User",
      authProvider: "email",
      isEmailVerified: true,
    });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET missing in test env");
    }

    const inviteeJwt = jwt.sign({ id: invitee._id.toString() }, secret, { expiresIn: "1d" });
    const inviteeCookie = `jwt=${inviteeJwt}`;

    const accepted = await request(app)
      .post("/api/v1/org-invites/accept")
      .set("Cookie", [inviteeCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ token: inviteToken })
      .expect(200);

    expect(accepted.body.invite?.status).toBe("accepted");
    expect(accepted.body.member?.org_id).toBe(orgId);
    expect(accepted.body.member?.user_id).toBe(invitee._id.toString());

    const myOrgs = await request(app)
      .get("/api/v1/orgs/me")
      .set("Cookie", [inviteeCookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(myOrgs.body.orgs)).toBe(true);
    expect(myOrgs.body.orgs.some((o: any) => o?.id === orgId)).toBe(true);

    const audit = await request(app)
      .get("/api/v1/audit/events?limit=50")
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    const actions = (audit.body.events as Array<any>).map((e) => e.action);
    expect(actions).toContain("org_invite_created");
    expect(actions).toContain("org_invite_accepted");
  }, 20_000);
});
