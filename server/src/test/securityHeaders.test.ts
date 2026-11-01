/**
 * @fileoverview Security Headers Middleware Tests
 *
 * Tests for the security headers middleware covering:
 * - X-Content-Type-Options set to nosniff
 * - X-Frame-Options set to DENY
 * - X-XSS-Protection is set
 * - Referrer-Policy is set
 * - Cache-Control is no-store
 * - HSTS in production
 * - X-Powered-By disabled
 */

import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { securityHeaders } from "../middleware/securityHeaders";

/**
 * Build a minimal app with security headers to test in isolation.
 */
const buildTestApp = (opts?: { hsts?: boolean }) => {
  const app = express();
  app.disable("x-powered-by");

  // Minimal request context so responses work
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).requestId = "test-req-id";
    next();
  });

  app.use(securityHeaders({ hsts: opts?.hsts ?? false }));

  app.get("/test", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
};

describe("security headers middleware", () => {
  const testApp = buildTestApp({ hsts: false });
  const hstsApp = buildTestApp({ hsts: true });
  const fullApp = createApp();

  beforeAll(() => {
    configurePassport();
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-XSS-Protection to 0 (disabled in favor of CSP)", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["x-xss-protection"]).toBe("0");
  });

  it("sets Referrer-Policy to strict-origin-when-cross-origin", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sets Cache-Control to no-store", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(res.headers["cache-control"]).toContain("must-revalidate");
  });

  it("sets Pragma to no-cache for HTTP/1.0 backward compatibility", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("sets HSTS header when hsts option is enabled (production)", async () => {
    const res = await request(hstsApp).get("/test").expect(200);
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["strict-transport-security"]).toContain("includeSubDomains");
    expect(res.headers["strict-transport-security"]).toContain("preload");
  });

  it("does NOT set HSTS header when hsts option is disabled (non-production)", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("removes X-Powered-By header", async () => {
    const res = await request(testApp).get("/test").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets Permissions-Policy to disable camera, microphone, geolocation, payment, usb", async () => {
    const res = await request(testApp).get("/test").expect(200);
    const policy = res.headers["permissions-policy"];
    expect(policy).toBeDefined();
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
    expect(policy).toContain("usb=()");
  });

  it("full app also removes X-Powered-By", async () => {
    const res = await request(fullApp).get("/healthz").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("security headers on full app (createApp)", () => {
  const fullApp = createApp();

  it("full app sets X-Content-Type-Options to nosniff", async () => {
    const res = await request(fullApp).get("/healthz").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("full app sets X-Frame-Options to DENY", async () => {
    const res = await request(fullApp).get("/healthz").expect(200);
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("full app sets Cache-Control with no-store", async () => {
    const res = await request(fullApp).get("/healthz").expect(200);
    expect(res.headers["cache-control"]).toContain("no-store");
  });
});
