import { afterEach, describe, expect, it } from "vitest";

import { getEnv } from "../config/env";

const originalClientUrl = process.env.CLIENT_URL;
const originalCorsOrigins = process.env.CORS_ORIGINS;

afterEach(() => {
  if (originalClientUrl === undefined) {
    delete process.env.CLIENT_URL;
  } else {
    process.env.CLIENT_URL = originalClientUrl;
  }

  if (originalCorsOrigins === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = originalCorsOrigins;
  }
});

describe("environment config", () => {
  it("treats localhost and 127.0.0.1 as equivalent local origins", () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    process.env.CORS_ORIGINS = "http://localhost:5173";

    const env = getEnv();

    expect(env.CORS_ORIGINS).toContain("http://localhost:5173");
    expect(env.CORS_ORIGINS).toContain("http://127.0.0.1:5173");
  });
});
