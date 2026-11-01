import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import ScheduledExportModel from "../models/scheduledExportModel";
import ExportJobModel from "../models/exportJobModel";
import TransactionModel from "../models/transactionModel";
import EntitlementModel from "../models/entitlementModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Scheduled Recurring Exports & Automated Email Dispatch", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TransactionModel.init();
    await ExportJobModel.init();
    await ScheduledExportModel.init();
    await EntitlementModel.init();
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

  it("creates, lists, updates, runs on-demand, and deletes scheduled recurring export reports", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    // 1. Initial list should be empty
    const listRes1 = await request(app)
      .get("/api/exports/schedules")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(listRes1.status).toBe(200);
    expect(listRes1.body.schedules).toEqual([]);

    // 2. Create a monthly summary scheduled report
    const postRes = await request(app)
      .post("/api/exports/schedules")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        name: "Executive Monthly Summary PDF",
        type: "monthly_summary_pdf",
        frequency: "monthly",
        delivery_email: "finance-team@example.com",
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body).toHaveProperty("schedule");
    const schedule = postRes.body.schedule;
    expect(schedule.name).toBe("Executive Monthly Summary PDF");
    expect(schedule.type).toBe("monthly_summary_pdf");
    expect(schedule.frequency).toBe("monthly");
    expect(schedule.delivery_email).toBe("finance-team@example.com");
    expect(schedule.status).toBe("active");
    expect(schedule.next_run_at).toBeDefined();

    const scheduleId = schedule.id;

    // 3. List should return the created schedule
    const listRes2 = await request(app)
      .get("/api/exports/schedules")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(listRes2.status).toBe(200);
    expect(listRes2.body.schedules.length).toBe(1);
    expect(listRes2.body.schedules[0].id).toBe(scheduleId);

    // 4. Update schedule: pause the schedule
    const patchRes = await request(app)
      .patch(`/api/exports/schedules/${scheduleId}`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        status: "paused",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.schedule.status).toBe("paused");

    // 5. Run on-demand test trigger
    const runRes = await request(app)
      .post(`/api/exports/schedules/${scheduleId}/run`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId));

    expect(runRes.status).toBe(200);
    expect(runRes.body).toHaveProperty("result");
    expect(runRes.body.result.success).toBe(true);
    expect(runRes.body.result.delivery_email).toBe("finance-team@example.com");
    expect(runRes.body.result.email_mode).toBeDefined();

    // Verify schedule metadata updated
    const updated = (await ScheduledExportModel.findById(scheduleId).lean()) as any;
    expect(updated).toBeDefined();
    expect(updated?.lastRunAt).toBeDefined();
    expect(updated?.lastDeliveryStatus).toBe("success");

    // 6. Delete schedule
    const delRes = await request(app)
      .delete(`/api/exports/schedules/${scheduleId}`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId));

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // 7. Verify empty list after deletion
    const listRes3 = await request(app)
      .get("/api/exports/schedules")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(listRes3.status).toBe(200);
    expect(listRes3.body.schedules).toEqual([]);
  });

  it("blocks free tier organizations without export_access", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
      .post("/api/exports/schedules")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        name: "Blocked Report",
        type: "monthly_summary_pdf",
        frequency: "monthly",
        delivery_email: "test@example.com",
      });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("validates input data when creating scheduled exports", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    const badRes = await request(app)
      .post("/api/exports/schedules")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        name: "",
        type: "invalid_type",
        delivery_email: "not-an-email",
      });

    expect(badRes.status).toBe(400);
  });

  it("creates, triggers on-demand, and verifies automated webhook push export delivery", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    let interceptedUrl = "";
    let interceptedOptions: any = null;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      interceptedUrl = url;
      interceptedOptions = options;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ received: true, ack: "audit-ok-123" }),
      };
    }) as any;

    try {
      // 1. Create a webhook-targeted schedule
      const postRes = await request(app)
        .post("/api/exports/schedules")
        .set("Cookie", [auth.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", String(orgId))
        .send({
          name: "SecOps Audit Webhook Push",
          type: "monthly_summary_pdf",
          frequency: "monthly",
          destination: "webhook",
          destination_config: {
            webhookUrl: "https://audit.example.com/api/v1/inbound-exports",
            authHeader: "Bearer sec-token-audit-456",
          },
        });

      expect(postRes.status).toBe(201);
      const schedule = postRes.body.schedule;
      expect(schedule.destination).toBe("webhook");
      expect(schedule.destination_config?.webhook_url).toBe("https://audit.example.com/api/v1/inbound-exports");

      const scheduleId = schedule.id;

      // 2. Trigger on-demand
      const runRes = await request(app)
        .post(`/api/exports/schedules/${scheduleId}/run`)
        .set("Cookie", [auth.cookie, csrfCookie])
        .set("X-CSRF-Token", csrfToken)
        .set("X-Org-Id", String(orgId));

      expect(runRes.status).toBe(200);
      expect(runRes.body.result.success).toBe(true);
      expect(runRes.body.result.destination).toBe("webhook");
      expect(runRes.body.result.webhook_url).toBe("https://audit.example.com/api/v1/inbound-exports");
      expect(runRes.body.result.http_code).toBe(200);
      expect(runRes.body.result.checksum_sha256).toBeDefined();

      // Verify webhook dispatch payload and headers
      expect(interceptedUrl).toBe("https://audit.example.com/api/v1/inbound-exports");
      expect(interceptedOptions.method).toBe("POST");
      expect(interceptedOptions.headers["Authorization"]).toBe("Bearer sec-token-audit-456");
      expect(interceptedOptions.headers["X-FinWise-Event"]).toBe("scheduled_export.delivered");
      expect(interceptedOptions.headers["X-FinWise-Checksum"]).toBe(runRes.body.result.checksum_sha256);

      const parsedBody = JSON.parse(interceptedOptions.body);
      expect(parsedBody.event).toBe("scheduled_export.delivered");
      expect(parsedBody.schedule_id).toBe(scheduleId);
      expect(parsedBody.schedule_name).toBe("SecOps Audit Webhook Push");
      expect(parsedBody.checksum_sha256).toBe(runRes.body.result.checksum_sha256);
      expect(typeof parsedBody.file_data_base64).toBe("string");
      expect(parsedBody.file_data_base64.length).toBeGreaterThan(0);

      // Verify DB update
      const updated = (await ScheduledExportModel.findById(scheduleId).lean()) as any;
      expect(updated.lastDeliveryStatus).toBe("success");
      expect(updated.lastDeliveryDetails?.destination).toBe("webhook");
      expect(updated.lastDeliveryDetails?.http_code).toBe(200);
      expect(updated.lastDeliveryDetails?.checksum_sha256).toBe(runRes.body.result.checksum_sha256);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("creates, triggers on-demand, and verifies cloud storage bucket (S3 / GCS) push sync", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    // 1. Create a cloud-storage-targeted schedule
    const postRes = await request(app)
      .post("/api/exports/schedules")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        name: "Enterprise Compliance S3 Archive",
        type: "transactions_csv",
        frequency: "weekly",
        destination: "cloud_storage",
        destination_config: {
          cloudProvider: "s3",
          bucketName: "compliance-exports-vault",
          bucketRegion: "us-east-1",
          bucketPrefix: "financial-audits/weekly",
          customFilename: "transactions-ledger-weekly.csv",
        },
      });

    expect(postRes.status).toBe(201);
    const schedule = postRes.body.schedule;
    expect(schedule.destination).toBe("cloud_storage");
    expect(schedule.destination_config?.bucket_name).toBe("compliance-exports-vault");
    expect(schedule.destination_config?.cloud_provider).toBe("s3");

    const scheduleId = schedule.id;

    // 2. Trigger on-demand
    const runRes = await request(app)
      .post(`/api/exports/schedules/${scheduleId}/run`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId));

    expect(runRes.status).toBe(200);
    expect(runRes.body.result.success).toBe(true);
    expect(runRes.body.result.destination).toBe("cloud_storage");
    expect(runRes.body.result.cloud_uri).toBe("s3://compliance-exports-vault/financial-audits/weekly/transactions-ledger-weekly.csv");
    expect(runRes.body.result.provider).toBe("s3");
    expect(runRes.body.result.checksum_sha256).toBeDefined();
    expect(runRes.body.result.size_bytes).toBeGreaterThan(0);

    // Verify DB update
    const updated = (await ScheduledExportModel.findById(scheduleId).lean()) as any;
    expect(updated.lastDeliveryStatus).toBe("success");
    expect(updated.lastDeliveryDetails?.destination).toBe("cloud_storage");
    expect(updated.lastDeliveryDetails?.cloud_uri).toBe("s3://compliance-exports-vault/financial-audits/weekly/transactions-ledger-weekly.csv");
    expect(updated.lastDeliveryDetails?.checksum_sha256).toBe(runRes.body.result.checksum_sha256);
  });
});
