import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { LEGACY_API_SUNSET } from "../middleware/legacyApiDeprecation";

describe("legacy /api deprecation headers", () => {
  const app = createApp();

  beforeAll(() => {
    configurePassport();
  });

  it("adds Deprecation and Sunset headers on legacy /api routes", async () => {
    const response = await request(app).get("/api/auth/providers").expect(200);

    expect(response.headers.deprecation).toBe("true");
    expect(response.headers.sunset).toBe(LEGACY_API_SUNSET);
  });

  it("does not add Deprecation headers on /api/v1 routes", async () => {
    const response = await request(app).get("/api/v1/auth/providers").expect(200);

    expect(response.headers.deprecation).toBeUndefined();
    expect(response.headers.sunset).toBeUndefined();
  });
});
