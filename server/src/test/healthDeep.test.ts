import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import axios from "axios";

describe("GET /healthz/deep", () => {
  beforeAll(configurePassport);
  afterEach(() => vi.restoreAllMocks());
  it("probes database, dead letters, and external services", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
    const app = createApp();
    const res = await request(app).get("/healthz/deep");
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("totalLatencyMs");
    expect(res.body).toHaveProperty("services");
    expect(res.body.services).toHaveProperty("database");
    expect(res.body.services).toHaveProperty("deadLetters");
    expect(typeof res.body.services.deadLetters.total).toBe("number");
    expect(res.body.services.ai_core.status).toBe("healthy");
  });
});
