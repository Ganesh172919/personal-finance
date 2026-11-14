import request from "supertest";
import axios from "axios";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Continuous Production Canary & Number Safety Invariant Verification", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  const getCsrf = async () => {
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;
    return { csrfCookie, csrfToken };
  };

  it("GET /api/ai/canary/number-safety returns 200 with canary telemetry", async () => {
    const auth = await createAuthedUser();

    const res = await request(app)
      .get("/api/ai/canary/number-safety")
      .set("Cookie", auth.cookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.canary).toBeDefined();
    expect(res.body.canary.status).toMatch(/healthy|warning|critical/);
    expect(res.body.canary.by_invariant).toBeDefined();
    expect(res.body.canary.by_invariant.number_subset).toBeDefined();
  });

  it("POST /api/ai/canary/validate verifies valid candidate narrative and balance sheet", async () => {
    const auth = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
      .post("/api/ai/canary/validate")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({
        candidate: "Monthly surplus is ₹15,000 with a 25.0% savings rate.",
        reference: "Monthly surplus: ₹15,000. Savings rate: 25.0%. Total savings: ₹50,000.",
        assets: 500000,
        liabilities: 150000,
        net_worth: 350000,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.all_passed).toBe(true);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].passed).toBe(true);
    expect(res.body.results[1].passed).toBe(true);
  });

  it("POST /api/ai/canary/validate catches hallucinated numbers and reports invariant violation", async () => {
    const auth = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
      .post("/api/ai/canary/validate")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({
        candidate: "Monthly surplus is ₹15,000 and target investment ₹99,999 with 12.5% return.",
        reference: "Monthly surplus: ₹15,000. Savings rate: 25.0%.",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.all_passed).toBe(false);
    expect(res.body.results[0].passed).toBe(false);
    expect(res.body.results[0].violations.length).toBeGreaterThan(0);
    expect(res.body.results[0].details.introduced_numbers).toContain("99999");
    expect(res.body.results[0].details.introduced_numbers).toContain("12.5%");
  });

  it("POST /api/ai/canary/validate checks zero-sum budget rebalancing conservation and detects leaks", async () => {
    const auth = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();

    // 1. Valid zero-sum reallocation
    const validRes = await request(app)
      .post("/api/ai/canary/validate")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({
        initial_allocations: { Housing: 30000, Dining: 10000, Savings: 10000 },
        proposed_allocations: { Housing: 30000, Dining: 6000, Savings: 14000 },
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.all_passed).toBe(true);
    expect(validRes.body.results[0].details.sum_deltas).toBe(0);

    // 2. Leaked budget pool
    const leakRes = await request(app)
      .post("/api/ai/canary/validate")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({
        initial_allocations: { Housing: 30000, Dining: 10000 },
        proposed_allocations: { Housing: 30000, Dining: 7000 }, // leaked 3000
      });

    expect(leakRes.status).toBe(200);
    expect(leakRes.body.all_passed).toBe(false);
    expect(leakRes.body.results[0].passed).toBe(false);
    expect(leakRes.body.results[0].violations[0]).toContain("Budget pool conservation broken");
  });

  it("POST /api/ai/canary/validate rejects empty payload with 400 status", async () => {
    const auth = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
      .post("/api/ai/canary/validate")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CANARY_PAYLOAD");
  });

  it("does not expose one user's financial canary values in another user's health summary", async () => {
    const firstUser = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();
    const first = await request(app).post("/api/ai/canary/validate")
      .set("Cookie", [firstUser.cookie, csrfCookie]).set("x-csrf-token", csrfToken)
      .send({ assets: 872348, liabilities: 123, net_worth: 872225 }).expect(200);
    expect(first.body.results[0].details.assets).toBe(872348);
    expect(first.body.canary_health.recent_events).toEqual([]);

    const secondUser = await createAuthedUser();
    const second = await request(app).get("/api/ai/canary/number-safety")
      .set("Cookie", secondUser.cookie).expect(200);
    expect(second.body.canary.recent_events).toEqual([]);
    expect(JSON.stringify(second.body)).not.toContain("872348");
  });

  it("redacts client-controlled source names from shared AI Core health", async () => {
    const auth = await createAuthedUser();
    const health = {
      status: "healthy", total_evaluations: 1, passed_evaluations: 1, failed_evaluations: 0,
      pass_rate_pct: 100, last_evaluated_at: new Date().toISOString(), by_invariant: {},
      by_source: { "another user's private account name": { total: 1, passed: 1, failed: 0, pass_rate_pct: 100 } },
      recent_events: [{ details: { assets: 872348 } }],
    };
    const probe = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: { canary: health } });
    try {
      const response = await request(app).get("/api/ai/canary/number-safety")
        .set("Cookie", auth.cookie).expect(200);
      expect(response.body.canary.by_source).toEqual({});
      expect(response.body.canary.recent_events).toEqual([]);
      expect(JSON.stringify(response.body)).not.toContain("private account name");
    } finally {
      probe.mockRestore();
    }
  });

  it("does not fabricate a passing canary probe suite when the AI service is unavailable", async () => {
    const auth = await createAuthedUser();
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
      .post("/api/ai/canary/run-probes")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .send({ sample_size: 4 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("CANARY_PROBES_UNAVAILABLE");
    expect(res.body.report).toBeUndefined();
  });

  it("GET /api/ai-core/canary/number-safety returns 200 via aiRoutes proxy path", async () => {
    const auth = await createAuthedUser();

    const res = await request(app)
      .get("/api/ai-core/canary/number-safety")
      .set("Cookie", auth.cookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.canary).toBeDefined();
  });
});
