import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { configurePassport } from "../config/passport";

const primaryOrigin = "https://finwise.example.test";
const aliasOrigin = "https://alias.example.test";
const deniedOrigin = "https://other.example.test";
const requestId = "ingress-test-123";

describe("API ingress", () => {
  beforeEach(() => {
    vi.stubEnv("CLIENT_URL", primaryOrigin);
    vi.stubEnv("CORS_ORIGINS", `${primaryOrigin},${aliasOrigin}`);
    vi.stubEnv("REDIS_URL", undefined);
    configurePassport();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([primaryOrigin, aliasOrigin])("allows credentialed preflights from %s", async (origin) => {
    await request(createApp())
      .options("/api/v1/auth/profile")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "GET")
      .set("X-Request-Id", requestId)
      .expect("Access-Control-Allow-Origin", origin)
      .expect("Access-Control-Allow-Credentials", "true")
      .expect("X-Request-Id", requestId)
      .expect(204);
  });

  it.each(["get", "options"] as const)("rejects %s from an unlisted origin with a traceable 403", async (method) => {
    const response = await request(createApp())[method]("/api/test")
      .set("Origin", deniedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("X-Request-Id", requestId)
      .expect("X-Request-Id", requestId)
      .expect(403);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body).toMatchObject({ code: "ORIGIN_NOT_ALLOWED", request_id: requestId });
  });

  it("accepts requests without an Origin header", async () => {
    const response = await request(createApp()).get("/api/test").expect(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("attaches the request ID to JSON parser errors", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .set("X-Request-Id", requestId)
      .set("Content-Type", "application/json")
      .send("{")
      .expect("X-Request-Id", requestId)
      .expect(400);

    expect(response.body).toMatchObject({ code: "INVALID_REQUEST_BODY", request_id: requestId });
  });

  it("tracks authentication limits independently for two clients behind both proxies", async () => {
    vi.stubEnv("TRUST_PROXY", "2");
    vi.stubEnv("AUTH_RATE_LIMIT_MAX", "1");
    const app = createApp();
    const login = (clientIp: string) => request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", `${clientIp}, 192.0.2.10`)
      .send({});

    await login("198.51.100.10").expect(400);
    await login("198.51.100.10").expect(429);
    await login("198.51.100.11").expect(400);
  });
});
