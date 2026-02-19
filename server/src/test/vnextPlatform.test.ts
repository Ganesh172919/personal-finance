import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("vNext platform surface", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let orgId = "";

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

    const membership = await ensurePersonalOrgForUser(auth.user._id);
    orgId = String((membership as any).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("exposes enterprise tier and expanded usage limits", async () => {
    const plans = await request(app)
      .get("/api/v1/plans")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(plans.body.plans.some((plan: any) => plan.id === "enterprise")).toBe(true);

    const entitlements = await request(app)
      .get("/api/v1/entitlements/me")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(entitlements.body.limits.api_requests).toBeGreaterThan(0);
    expect(entitlements.body.limits.workflow_runs).toBeGreaterThan(0);
    expect(entitlements.body.limits.connector_sync_records).toBeGreaterThan(0);
    expect(entitlements.body.limits.marketplace_installs).toBeGreaterThanOrEqual(0);
    expect(entitlements.body.usage.api_requests).toBe(0);
    expect(entitlements.body.usage.workflow_runs).toBe(0);
    expect(entitlements.body.usage.connector_sync_records).toBe(0);
    expect(entitlements.body.usage.marketplace_installs).toBe(0);
  });

  it("manages feature flags, plugins, integrations, automation events, and analytics", async () => {
    await request(app)
      .put("/api/v1/feature-flags/automation.engine.v2")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ enabled: true, variant: "beta", rollout_percent: 35, metadata: { source: "test" } })
      .expect(201);

    const flags = await request(app)
      .get("/api/v1/feature-flags")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(flags.body.flags.length).toBe(1);
    expect(flags.body.flags[0].key).toBe("automation.engine.v2");
    expect(flags.body.flags[0].enabled).toBe(true);

    const catalog = await request(app)
      .get("/api/v1/marketplace/catalog")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(Array.isArray(catalog.body.plugins)).toBe(true);
    expect(catalog.body.plugins.length).toBeGreaterThan(0);

    await request(app)
      .post("/api/v1/marketplace/install")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ plugin_key: "finwise.connector.bank_stub", version: "1.0.0" })
      .expect(201);

    const plugins = await request(app)
      .get("/api/v1/plugins")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(plugins.body.plugins.length).toBe(1);
    expect(plugins.body.plugins[0].plugin_key).toBe("finwise.connector.bank_stub");

    await request(app)
      .post("/api/v1/plugins/finwise.connector.bank_stub/update")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ version: "1.0.0" })
      .expect(200);

    await request(app)
      .post("/api/v1/integrations/bank_stub/sync")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ records_synced: 12 })
      .expect(202);

    const integrationHistory = await request(app)
      .get("/api/v1/integrations/bank_stub/history")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(integrationHistory.body.history.length).toBe(1);
    expect(integrationHistory.body.history[0].records_synced).toBe(12);

    const automationEvents = await request(app)
      .get("/api/v1/automation/events")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(automationEvents.body.events.some((event: any) => event.event_type === "TransactionCreated")).toBe(true);

    await request(app)
      .post("/api/v1/automation/events/emit")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        event_type: "TransactionCreated",
        aggregate_type: "transaction",
        aggregate_id: "tx:test",
        payload: { amount: 10 },
      })
      .expect(202);

    const analytics = await request(app)
      .get("/api/v1/analytics/overview")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);
    expect(analytics.body.metrics.feature_flags).toBe(1);
    expect(analytics.body.metrics.installed_plugins).toBe(1);
    expect(analytics.body.metrics.connected_integrations).toBe(1);
    expect(analytics.body.usage.connector_sync_records.units).toBe(12);

    await request(app)
      .post("/api/v1/plugins/finwise.connector.bank_stub/uninstall")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .expect(200);

    await request(app)
      .delete("/api/v1/feature-flags/automation.engine.v2")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .expect(200);
  });

  it("meters api key requests and workflow runs in usage", async () => {
    const createKey = await request(app)
      .post("/api/v1/api-keys")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ name: "Smoke API Key", scopes: ["usage:read", "workflows:write"] })
      .expect(201);

    const apiKey = String(createKey.body.api_key || "");
    expect(apiKey.length).toBeGreaterThan(20);

    await request(app)
      .get("/api/v1/usage/ledger")
      .set("X-Org-Id", orgId)
      .set("X-API-Key", apiKey)
      .expect(200);

    const workflow = await request(app)
      .post("/api/v1/workflows")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        name: "Usage metering workflow",
        trigger: { type: "manual" },
        actions: [
          {
            type: "create_task",
            bucket: 7,
            title: "Metering test task",
            why: "Validate workflow usage metering",
            expected_impact: "Improved reliability",
          },
        ],
      })
      .expect(201);

    const workflowId = String(workflow.body.workflow.id);
    expect(workflowId.length).toBeGreaterThan(10);

    await request(app)
      .post(`/api/v1/workflows/${workflowId}/run`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({})
      .expect(200);

    const entitlements = await request(app)
      .get("/api/v1/entitlements/me")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(entitlements.body.usage.api_requests).toBeGreaterThanOrEqual(1);
    expect(entitlements.body.usage.workflow_runs).toBeGreaterThanOrEqual(1);
  });
});
