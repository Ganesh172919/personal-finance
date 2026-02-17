import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiCoreClient", async () => {
  const actual = await vi.importActual<typeof import("../services/aiCoreClient")>("../services/aiCoreClient");
  return {
    ...actual,
    processAiCoreScenario: vi.fn(async (payload: any, requestId: string) => ({
      scenario_type: payload?.scenario_type || "expense",
      amount: payload?.amount || 0,
      baseline: {
        monthly_income: 50000,
        monthly_expenses: 30000,
        monthly_surplus: 20000,
        savings: 100000,
        total_debt: 0,
      },
      delta: {
        monthly_surplus_change: -1000,
        new_monthly_surplus: 19000,
        savings_change_horizon: -12000,
        projected_investment_value: null,
        emergency_fund_months_before: 3,
        emergency_fund_months_after: 2.6,
        goal_timeline_delta_months: 1,
      },
      assumptions: payload?.assumptions || { months: 12 },
      recommendations: ["test recommendation"],
      originalBudget: 20000,
      newBudget: 19000,
      savingsImpact: -1000,
      goalDelay: 1,
      adjustments: [],
      request_id: requestId,
    })),
  };
});

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("scenario API", () => {
  const app = createApp();
  let cookie = "";
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
    cookie = auth.cookie;

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("accepts v2 scenario contract and returns normalized request context", async () => {
    const response = await request(app)
      .post("/api/scenarios/what-if")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        parameters: {
          scenario_type: "expense",
          amount: 2500,
          description: "Gym subscription",
          assumptions: { months: 6, inflation_pct: 5 },
        },
      })
      .expect(200);

    expect(response.body.scenario_type).toBe("expense");
    expect(response.body.scenario_request).toMatchObject({
      scenario_type: "expense",
      amount: 2500,
    });
    expect(response.body.assumptions.months).toBe(6);
  });

  it("keeps backward compatibility for legacy scenario payloads", async () => {
    const response = await request(app)
      .post("/api/scenarios/what-if")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        parameters: {
          type: "income",
          income: 4000,
          description: "Freelance",
        },
      })
      .expect(200);

    expect(response.body.scenario_request).toMatchObject({
      scenario_type: "income",
      amount: 4000,
    });
    expect(response.body.request_id).toBeTruthy();
  });
});
