import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";

describe("csrf protection", () => {
  const app = createApp();

  beforeAll(() => {
    configurePassport();
  });

  it("issues a csrf token cookie and echoes the token", async () => {
    const response = await request(app).get("/api/auth/csrf").expect(200);

    expect(response.body.csrf_token).toBeTypeOf("string");
    expect(response.body.csrf_token.length).toBeGreaterThan(10);
    expect(Array.isArray(response.headers["set-cookie"])).toBe(true);
    expect(String(response.headers["set-cookie"]?.[0] || "")).toContain("csrf_token=");
  });

  it("allows unsafe requests without CSRF when JWT cookie is absent", async () => {
    await request(app).post("/api/auth/logout").expect(200);
  });

  it("blocks unsafe cookie-authenticated requests without a matching csrf header", async () => {
    const jwtCookie = "jwt=invalid-token";

    await request(app).post("/api/auth/logout").set("Cookie", [jwtCookie]).expect(403);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", [jwtCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);
  });
});
