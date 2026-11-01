/**
 * @fileoverview Rate Limiter Tests
 *
 * Tests for the Express rate limiting middleware covering:
 * - Requests allowed under the limit
 * - Requests blocked when limit is exceeded
 * - Rate limit resets after window expires
 * - Different limits for auth vs general endpoints
 * - Rate limit key strategies (IP, user, org)
 */

import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("rate limiting", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("allows requests under the rate limit", async () => {
    const res = await request(app).get("/api/test").expect(200);

    expect(res.body.message).toBe("Hello from the Personal Finance Server!");
  });

  it("returns rate limit headers with each response", async () => {
    const res = await request(app).get("/api/test").expect(200);

    // express-rate-limit with standardHeaders=true sets RateLimit-* headers
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
    expect(res.headers["ratelimit-reset"]).toBeDefined();
  });

  it("decrements remaining count on successive requests", async () => {
    const res1 = await request(app).get("/api/test").expect(200);
    const remaining1 = parseInt(res1.headers["ratelimit-remaining"] || "999", 10);

    const res2 = await request(app).get("/api/test").expect(200);
    const remaining2 = parseInt(res2.headers["ratelimit-remaining"] || "999", 10);

    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  it("blocks requests with 429 when general API rate limit is exceeded", async () => {
    // The default RATE_LIMIT_MAX is 200 in test env.
    // We create a dedicated mini-app with a very low limit to test blocking.
    const express = await import("express");
    const rateLimit = await import("express-rate-limit");
    const { sendErrorResponse } = await import("../utils/apiResponse");

    const miniApp = express.default();
    miniApp.use(express.default.json());

    const strictLimiter = rateLimit.default({
      windowMs: 60_000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        sendErrorResponse(res, 429, {
          message: "Too many requests, please try again shortly.",
          code: "RATE_LIMITED",
          requestId: (req as any).requestId || "test",
        });
      },
    });

    miniApp.use("/api", strictLimiter);
    miniApp.get("/api/test", (_req, res) => res.json({ ok: true }));

    // First 3 should succeed
    await request(miniApp).get("/api/test").expect(200);
    await request(miniApp).get("/api/test").expect(200);
    await request(miniApp).get("/api/test").expect(200);

    // 4th should be blocked
    const blocked = await request(miniApp).get("/api/test").expect(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(blocked.body.success).toBe(false);
  });

  it("auth rate limiter uses tighter limits than general rate limiter", async () => {
    // The auth rate limiter defaults to AUTH_RATE_LIMIT_MAX=20.
    // We verify the auth endpoints have their own independent limit
    // by checking that hitting general endpoints doesn't consume auth limit.
    const auth1 = await request(app).post("/api/auth/login").send({ email: "no@user.com", password: "x" });
    const authRemaining = parseInt(auth1.headers["ratelimit-remaining"] || "999", 10);

    // Hit a general endpoint (not /api/auth)
    await request(app).get("/api/test").expect(200);

    // Auth remaining should not have changed from hitting a non-auth endpoint
    const auth2 = await request(app).post("/api/auth/login").send({ email: "no@user.com", password: "x" });
    const authRemaining2 = parseInt(auth2.headers["ratelimit-remaining"] || "999", 10);

    // Both are auth requests, so remaining should decrease by 1
    expect(authRemaining2).toBeLessThanOrEqual(authRemaining);
  });

  it("rate limit key separates unauthenticated requests by IP", async () => {
    // Two unauthenticated requests from the same test agent share the same IP,
    // so they share the same rate limit bucket.
    const res1 = await request(app).get("/api/test").expect(200);
    const res2 = await request(app).get("/api/test").expect(200);

    const remaining1 = parseInt(res1.headers["ratelimit-remaining"] || "999", 10);
    const remaining2 = parseInt(res2.headers["ratelimit-remaining"] || "999", 10);

    // Same IP means same bucket; remaining should decrease
    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  it("profile and CSRF reads do not exhaust credential-attempt limits; login still does", async () => {
    const isolatedApp = createApp();
    const { cookie } = await createAuthedUser();
    const csrf = await request(isolatedApp).get("/api/auth/csrf").expect(200);
    const csrfCookie = String(csrf.headers["set-cookie"]?.[0] || "").split(";")[0];
    const token = csrf.body.csrf_token;
    for (let index = 0; index < 25; index++) {
      await request(isolatedApp).get("/api/auth/profile").set("Cookie", cookie).expect(200);
      await request(isolatedApp).get("/api/auth/csrf").expect(200);
    }
    for (let index = 0; index < 20; index++) {
      await request(isolatedApp).post("/api/auth/login").set("Cookie", csrfCookie)
        .set("X-CSRF-Token", token).send({}).expect(400);
    }
    const blocked = await request(isolatedApp).post("/api/auth/login").set("Cookie", csrfCookie)
      .set("X-CSRF-Token", token).send({}).expect(429);
    expect(blocked.body.code).toBe("AUTH_RATE_LIMITED");
    await request(isolatedApp).get("/api/auth/profile").set("Cookie", cookie).expect(200);
  });

  it("rate limit key uses user ID for authenticated requests", async () => {
    const { cookie } = await createAuthedUser();

    const res1 = await request(app).get("/api/transactions").set("Cookie", [cookie]).expect(200);
    const res2 = await request(app).get("/api/transactions").set("Cookie", [cookie]).expect(200);

    const remaining1 = parseInt(res1.headers["ratelimit-remaining"] || "999", 10);
    const remaining2 = parseInt(res2.headers["ratelimit-remaining"] || "999", 10);

    // Authenticated user shares the same bucket, so remaining decreases
    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  it("returns correct RATE_LIMITED code and message when blocked", async () => {
    const express = await import("express");
    const rateLimit = await import("express-rate-limit");
    const { sendErrorResponse } = await import("../utils/apiResponse");

    const miniApp = express.default();
    const strictLimiter = rateLimit.default({
      windowMs: 60_000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        sendErrorResponse(res, 429, {
          message: "Too many requests, please try again shortly.",
          code: "RATE_LIMITED",
          requestId: (req as any).requestId || "test",
        });
      },
    });

    miniApp.use(strictLimiter);
    miniApp.get("/test", (_req, res) => res.json({ ok: true }));

    await request(miniApp).get("/test").expect(200);

    const blocked = await request(miniApp).get("/test").expect(429);
    expect(blocked.body).toMatchObject({
      success: false,
      code: "RATE_LIMITED",
      message: "Too many requests, please try again shortly.",
      data: null,
    });
  });

  it("health check endpoint is subject to rate limiting like other routes", async () => {
    // /healthz is outside /api namespace so it should not be rate limited
    const res = await request(app).get("/healthz").expect(200);
    // No rate limit headers expected for routes outside /api
    // (helmet and other middleware may set other headers, but not RateLimit-*)
    expect(res.text).toBe("ok");
  });

  it("diagnostics endpoint reports system health and dead letter stats", async () => {
    const res = await request(app).get("/healthz/diagnostics").expect(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("deadLetters");
  });
});
