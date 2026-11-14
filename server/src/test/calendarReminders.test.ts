import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Calendar Reminders API & Batch Management", () => {
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

  it("creates reminders, lists with date range filters, and toggles completion", async () => {
    // 1. Create reminder 1
    const createRes1 = await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        date: "2026-10-05",
        title: "Rent Payment ($1,500)",
        description: "Apartment lease payment",
      })
      .expect(201);

    expect(createRes1.body.reminder.title).toBe("Rent Payment ($1,500)");
    expect(createRes1.body.reminder.completed).toBe(false);
    const remId1 = createRes1.body.reminder.id;

    // 2. Create reminder 2
    const createRes2 = await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        date: "2026-10-15",
        title: "Electric Bill ($120)",
      })
      .expect(201);
    const remId2 = createRes2.body.reminder.id;

    // 3. Create reminder 3 in November
    await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        date: "2026-11-01",
        title: "Health Insurance ($300)",
      })
      .expect(201);

    // 4. List with range filter for October
    const listOct = await request(app)
      .get("/api/calendar-reminders?from=2026-10-01&to=2026-10-31")
      .set("Cookie", [cookie])
      .expect(200);

    expect(listOct.body.reminders).toHaveLength(2);
    expect(listOct.body.reminders[0].title).toBe("Rent Payment ($1,500)");
    expect(listOct.body.reminders[1].title).toBe("Electric Bill ($120)");

    // 5. Toggle completion of reminder 1
    const toggleRes = await request(app)
      .patch(`/api/calendar-reminders/${remId1}/toggle`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    expect(toggleRes.body.reminder.completed).toBe(true);

    // 6. Delete reminder 2
    await request(app)
      .delete(`/api/calendar-reminders/${remId2}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    const listRemaining = await request(app)
      .get("/api/calendar-reminders?from=2026-10-01&to=2026-10-31")
      .set("Cookie", [cookie])
      .expect(200);

    expect(listRemaining.body.reminders).toHaveLength(1);
    expect(listRemaining.body.reminders[0].id).toBe(remId1);
  });

  it("supports batch completing and clearing completed reminders", async () => {
    // 1. Seed 3 pending reminders
    await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-10-10", title: "Water Bill ($45)" })
      .expect(201);

    await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-10-12", title: "Internet Bill ($80)" })
      .expect(201);

    await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-10-25", title: "Credit Card Min ($150)" })
      .expect(201);

    // 2. Batch complete reminders in October range
    const batchRes = await request(app)
      .post("/api/calendar-reminders/batch-complete")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ from: "2026-10-01", to: "2026-10-31" })
      .expect(200);

    expect(batchRes.body.success).toBe(true);
    expect(batchRes.body.updated).toBe(3);

    // Verify all 3 are completed
    const listAfterBatch = await request(app)
      .get("/api/calendar-reminders?from=2026-10-01&to=2026-10-31")
      .set("Cookie", [cookie])
      .expect(200);

    expect(listAfterBatch.body.reminders.every((r: any) => r.completed)).toBe(true);

    // 3. Clear completed reminders
    const clearRes = await request(app)
      .post("/api/calendar-reminders/clear-completed")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ from: "2026-10-01", to: "2026-10-31" })
      .expect(200);

    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.deleted).toBe(3);

    // Verify empty
    const listEmpty = await request(app)
      .get("/api/calendar-reminders?from=2026-10-01&to=2026-10-31")
      .set("Cookie", [cookie])
      .expect(200);

    expect(listEmpty.body.reminders).toHaveLength(0);
  });

  it("enforces multi-tenant organization and user isolation", async () => {
    // 1. User 1 creates reminder
    const user1Rem = await request(app)
      .post("/api/calendar-reminders")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-10-18", title: "User 1 Private Reminder" })
      .expect(201);

    const remId = user1Rem.body.reminder.id;

    // 2. User 2 (different account and org)
    const user2Auth = await createAuthedUser();
    const user2Csrf = await request(app).get("/api/auth/csrf").expect(200);
    const user2CsrfCookie = (user2Csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const user2CsrfToken = user2Csrf.body.csrf_token as string;

    // User 2 cannot see User 1's reminder
    const user2List = await request(app)
      .get("/api/calendar-reminders?from=2026-10-01&to=2026-10-31")
      .set("Cookie", [user2Auth.cookie])
      .expect(200);

    expect(user2List.body.reminders).toHaveLength(0);

    // User 2 cannot toggle User 1's reminder
    await request(app)
      .patch(`/api/calendar-reminders/${remId}/toggle`)
      .set("Cookie", [user2Auth.cookie, user2CsrfCookie])
      .set("X-CSRF-Token", user2CsrfToken)
      .expect(404);

    // User 2 cannot delete User 1's reminder
    await request(app)
      .delete(`/api/calendar-reminders/${remId}`)
      .set("Cookie", [user2Auth.cookie, user2CsrfCookie])
      .set("X-CSRF-Token", user2CsrfToken)
      .expect(404);
  });
});
