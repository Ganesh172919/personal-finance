import { afterEach, describe, expect, it } from "vitest";

import { getEnv } from "../config/env";

const originalClientUrl = process.env.CLIENT_URL;
const originalCorsOrigins = process.env.CORS_ORIGINS;
const originalNodeEnv = process.env.NODE_ENV;
const originalAiCoreToken = process.env.AI_CORE_INTERNAL_TOKEN;

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

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalAiCoreToken === undefined) delete process.env.AI_CORE_INTERNAL_TOKEN;
  else process.env.AI_CORE_INTERNAL_TOKEN = originalAiCoreToken;
});

describe("environment config", () => {
  it("treats localhost and 127.0.0.1 as equivalent local origins", () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    process.env.CORS_ORIGINS = "http://localhost:5173";

    const env = getEnv();

    expect(env.CORS_ORIGINS).toContain("http://localhost:5173");
    expect(env.CORS_ORIGINS).toContain("http://127.0.0.1:5173");
  });

  it("rejects wildcard credentialed CORS configuration", () => {
    process.env.CORS_ORIGINS = "*";
    expect(() => getEnv()).toThrow("CORS_ORIGINS must list explicit origins");
  });

  it("requires the AI Core token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://app.example.com";
    process.env.CORS_ORIGINS = "https://app.example.com";
    delete process.env.AI_CORE_INTERNAL_TOKEN;
    expect(() => getEnv()).toThrow("AI_CORE_INTERNAL_TOKEN is required in production");
  });
});
