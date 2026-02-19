import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import OrgMemberModel from "../models/orgMemberModel";
import OrganizationModel from "../models/organizationModel";
import SubscriptionModel from "../models/subscriptionModel";
import UserModel from "../models/userModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("org team plan and seat enforcement", () => {
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
    await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("blocks team org creation on non-team plans", async () => {
    const response = await request(app)
      .post("/api/v1/orgs")
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Blocked Team Org" })
      .expect(402);

    expect(response.body.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("blocks adding members when org plan is not team", async () => {
    const teamOrg = await OrganizationModel.create({
      name: "Team Org Free",
      slug: "team-org-free",
      type: "team",
      createdByUserId: new mongoose.Types.ObjectId(ownerUserId),
    });

    await OrgMemberModel.create({
      orgId: teamOrg._id,
      userId: new mongoose.Types.ObjectId(ownerUserId),
      role: "owner",
      status: "active",
      isDefault: false,
    });

    const response = await request(app)
      .post(`/api/v1/orgs/${teamOrg._id.toString()}/members`)
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", teamOrg._id.toString())
      .send({ email: "member@example.com", role: "member" })
      .expect(402);

    expect(response.body.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("enforces team seat limits on member add and invite acceptance", async () => {
    const teamOrg = await OrganizationModel.create({
      name: "Seat Limited Org",
      slug: "seat-limited-org",
      type: "team",
      createdByUserId: new mongoose.Types.ObjectId(ownerUserId),
    });

    await OrgMemberModel.create({
      orgId: teamOrg._id,
      userId: new mongoose.Types.ObjectId(ownerUserId),
      role: "owner",
      status: "active",
      isDefault: false,
    });

    await SubscriptionModel.create({
      orgId: teamOrg._id,
      provider: "stub",
      planTier: "team",
      status: "active",
      seats: 2,
    });

    const inviteResponse = await request(app)
      .post(`/api/v1/orgs/${teamOrg._id.toString()}/members`)
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", teamOrg._id.toString())
      .send({ email: "invitee@example.com", role: "member" })
      .expect(201);

    expect(inviteResponse.body.invite?.token).toBeTruthy();
    const inviteToken = String(inviteResponse.body.invite.token);

    const existingMember = await UserModel.create({
      email: "existing-member@example.com",
      name: "Existing Member",
      authProvider: "email",
      isEmailVerified: true,
    });

    await OrgMemberModel.create({
      orgId: teamOrg._id,
      userId: existingMember._id,
      role: "member",
      status: "active",
      isDefault: false,
    });

    const seatFullAdd = await request(app)
      .post(`/api/v1/orgs/${teamOrg._id.toString()}/members`)
      .set("Cookie", [ownerCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", teamOrg._id.toString())
      .send({ email: "another@example.com", role: "member" })
      .expect(402);

    expect(seatFullAdd.body.code).toBe("FEATURE_LIMIT_REACHED");
    expect(seatFullAdd.body.details?.feature).toBe("team_seats");

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

    const accept = await request(app)
      .post("/api/v1/org-invites/accept")
      .set("Cookie", [inviteeCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ token: inviteToken })
      .expect(402);

    expect(accept.body.code).toBe("FEATURE_LIMIT_REACHED");
    expect(accept.body.details?.feature).toBe("team_seats");
  });
});
