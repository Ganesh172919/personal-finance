import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TaskModel from "../models/taskModel";
import FinancialProfileModel from "../models/financialProfileModel";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import CalendarReminderModel from "../models/calendarReminderModel";
import { FollowThroughPreferenceModel } from "../models/followThroughPreferenceModel";
import {
  getFollowThroughRecommendations,
  recordFollowThroughFeedback,
} from "../services/followThroughService";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const objectId = () => new mongoose.Types.ObjectId();

describe("Personalized Follow-Through & Activity Signal Ranking Engine", () => {
  const app = createApp();
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    await TaskModel.init();
    await FinancialProfileModel.init();
    await BudgetAllocationModel.init();
    await CalendarReminderModel.init();
    await FollowThroughPreferenceModel.init();
  }, 60_000);

  afterAll(stopTestDb);

  beforeEach(async () => {
    await clearTestDb();
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token);
  });

  describe("Service Tier: Follow-Through Engine", () => {
    it("extracts multi-source signals and enforces deterministic priority scoring [0, 100]", async () => {
      const orgId = objectId();
      const userId = objectId();

      // 1. Seed task
      await TaskModel.create({
        _id: "task_1",
        orgId,
        userId,
        title: "Review Tax Strategy",
        why: "Annual tax optimization",
        steps: ["Review W-2", "Check 1040 deductions"],
        expected_impact: "Saves up to $1500 in tax liabilities",
        kind: "generic",
        priority: "high",
        bucket: 7,
        status: "open",
        dueDate: new Date(Date.now() + 5 * 86400000),
      });

      // 2. Seed profile with goals and debts
      await FinancialProfileModel.create({
        orgId,
        userId,
        age: 32,
        annual_income: 95000,
        monthly_expenses: 4200,
        savings: 15000,
        goals: [
          {
            name: "Emergency Reserve",
            target: 18000,
            current: 8500,
            deadline: "2027-01-01",
            priority: 1,
          },
        ],
        debts: [
          {
            name: "Visa Credit Card",
            balance: 4200,
            interest_rate: 24.5,
            minimum_payment: 120,
            type: "credit_card",
          },
        ],
      });

      // 3. Seed budget allocation
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await BudgetAllocationModel.create({
        orgId,
        periodKey: currentPeriod,
        category: "Dining Out",
        amount: 450,
        currency: "USD",
      });

      // 4. Seed calendar reminder
      await CalendarReminderModel.create({
        orgId,
        userId,
        title: "Electric Utility Bill",
        date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        completed: false,
      });

      const res = await getFollowThroughRecommendations(orgId, userId, 10);

      expect(res.totalSignals).toBeGreaterThanOrEqual(4);
      expect(res.items.length).toBeGreaterThanOrEqual(4);

      // Verify domain variety and score bounds
      const domains = res.items.map((i) => i.domain);
      expect(domains).toContain("task");
      expect(domains).toContain("goal");
      expect(domains).toContain("debt");
      expect(domains).toContain("reminder");

      res.items.forEach((item) => {
        expect(item.priorityScore).toBeGreaterThanOrEqual(0);
        expect(item.priorityScore).toBeLessThanOrEqual(100);
        expect(["critical", "high", "medium", "low"]).toContain(item.priorityTier);
        expect(item.actionUrl).toMatch(/^\//);
      });
    });

    it("strictly ranks overdue tasks ahead of future tasks", async () => {
      const orgId = objectId();
      const userId = objectId();

      // Future task
      await TaskModel.create({
        _id: "future_task",
        orgId,
        userId,
        title: "Future Check-in",
        why: "Review upcoming budget items",
        steps: ["Open spreadsheet"],
        expected_impact: "Good planning",
        kind: "generic",
        priority: "low",
        bucket: 30,
        status: "open",
        dueDate: new Date(Date.now() + 10 * 86400000),
      });

      // Overdue task
      await TaskModel.create({
        _id: "overdue_task",
        orgId,
        userId,
        title: "Overdue Bill Payment",
        why: "Avoid late fees",
        steps: ["Pay electric company"],
        expected_impact: "Avoids $35 penalty fee",
        kind: "generic",
        priority: "medium",
        bucket: 7,
        status: "open",
        dueDate: new Date(Date.now() - 3 * 86400000),
      });

      const res = await getFollowThroughRecommendations(orgId, userId, 10);
      expect(res.items.length).toBe(2);
      expect(res.items[0].id).toBe("task:overdue_task");
      expect(res.items[0].isOverdue).toBe(true);
      expect(res.items[1].id).toBe("task:future_task");
    });

    it("learns preferences from feedback and boosts upvoted domain score", async () => {
      const orgId = objectId();
      const userId = objectId();

      await FinancialProfileModel.create({
        orgId,
        userId,
        age: 30,
        annual_income: 80000,
        monthly_expenses: 3500,
        savings: 10000,
        debts: [
          {
            name: "Student Loan",
            balance: 15000,
            interest_rate: 6.5,
            minimum_payment: 200,
            type: "student_loan",
          },
        ],
      });

      // Initial baseline score
      const initial = await getFollowThroughRecommendations(orgId, userId, 10);
      const initialDebtScore = initial.items.find((i) => i.domain === "debt")?.priorityScore || 0;

      // Record upvote feedback
      await recordFollowThroughFeedback(orgId, userId, {
        signalId: initial.items.find((i) => i.domain === "debt")!.id,
        domain: "debt",
        action: "upvote",
        reason: "Aggressively tackling debt",
      });

      // Post-feedback score
      const updated = await getFollowThroughRecommendations(orgId, userId, 10);
      const updatedDebtScore = updated.items.find((i) => i.domain === "debt")?.priorityScore || 0;

      expect(updated.learnedAffinities["debt"]).toBeGreaterThan(0.3);
      expect(updatedDebtScore).toBeGreaterThan(initialDebtScore);
    });

    it("filters out dismissed signals from recommendation list", async () => {
      const orgId = objectId();
      const userId = objectId();

      await TaskModel.create({
        _id: "task_to_dismiss",
        orgId,
        userId,
        title: "Optional Survey",
        why: "Feedback on feature",
        steps: ["Click link"],
        expected_impact: "Better app experience",
        kind: "generic",
        priority: "low",
        bucket: 30,
        status: "open",
      });

      const initial = await getFollowThroughRecommendations(orgId, userId, 10);
      expect(initial.items.some((i) => i.id === "task:task_to_dismiss")).toBe(true);

      // Dismiss signal
      await recordFollowThroughFeedback(orgId, userId, {
        signalId: "task:task_to_dismiss",
        domain: "task",
        action: "dismiss",
      });

      const updated = await getFollowThroughRecommendations(orgId, userId, 10);
      expect(updated.items.some((i) => i.id === "task:task_to_dismiss")).toBe(false);
    });
  });

  describe("REST API Endpoints", () => {
    it("GET /api/follow-through/recommendations returns 200 with ranked items", async () => {
      const auth = await createAuthedUser();
      const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

      await TaskModel.create({
        _id: "api_task_1",
        orgId,
        userId: auth.user._id,
        title: "Check Net Worth Statement",
        why: "Verify balance sheet assets vs liabilities",
        steps: ["Download statement", "Compare balances"],
        expected_impact: "Accurate net worth visibility",
        kind: "generic",
        priority: "high",
        bucket: 7,
        status: "open",
      });

      const res = await request(app)
        .get("/api/follow-through/recommendations")
        .set("Cookie", auth.cookie)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("items");
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0]).toHaveProperty("priorityScore");
      expect(res.body.data.items[0]).toHaveProperty("priorityTier");
    });

    it("POST /api/follow-through/feedback records user action and updates preferences", async () => {
      const auth = await createAuthedUser();
      await ensurePersonalOrgForUser(auth.user._id);

      const res = await request(app)
        .post("/api/follow-through/feedback")
        .set("Cookie", [auth.cookie, csrfCookie])
        .set("x-csrf-token", csrfToken)
        .send({
          signalId: "task:test_signal",
          domain: "task",
          action: "upvote",
          reason: "Important priority",
        })
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.feedbackHistoryCount).toBe(1);
    });

    it("GET and PUT /api/follow-through/preferences mutates user focus domains", async () => {
      const auth = await createAuthedUser();
      await ensurePersonalOrgForUser(auth.user._id);

      // 1. Get initial preferences
      const getRes = await request(app)
        .get("/api/follow-through/preferences")
        .set("Cookie", auth.cookie)
        .expect(200);

      expect(getRes.body.status).toBe("success");
      expect(getRes.body.data.riskTolerance).toBe("moderate");

      // 2. Update preferences
      const putRes = await request(app)
        .put("/api/follow-through/preferences")
        .set("Cookie", [auth.cookie, csrfCookie])
        .set("x-csrf-token", csrfToken)
        .send({
          focusDomains: { debt: 1.8, budget: 1.4 },
          riskTolerance: "aggressive",
          preferredCadence: "daily",
        })
        .expect(200);

      expect(putRes.body.status).toBe("success");
      expect(putRes.body.data.riskTolerance).toBe("aggressive");
      expect(putRes.body.data.preferredCadence).toBe("daily");
      expect(putRes.body.data.focusDomains.debt).toBe(1.8);
    });

    it("enforces tenant boundary isolation between different organizations", async () => {
      const authA = await createAuthedUser({ email: "user_a@finwise.test" });
      const orgA = await ensurePersonalOrgForUser(authA.user._id);

      const authB = await createAuthedUser({ email: "user_b@finwise.test" });
      await ensurePersonalOrgForUser(authB.user._id);

      await TaskModel.create({
        _id: "private_user_a_task",
        orgId: orgA.orgId,
        userId: authA.user._id,
        title: "Confidential Executive Task",
        why: "Internal business planning",
        steps: ["Step 1"],
        expected_impact: "Confidential",
        kind: "generic",
        priority: "high",
        bucket: 7,
        status: "open",
      });

      // User B query recommendations
      const resB = await request(app)
        .get("/api/follow-through/recommendations")
        .set("Cookie", authB.cookie)
        .expect(200);

      // Must not contain User A's private task
      const userBItemIds = resB.body.data.items.map((i: any) => i.id);
      expect(userBItemIds).not.toContain("task:private_user_a_task");
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      await request(app)
        .get("/api/follow-through/recommendations")
        .expect(401);

      await request(app)
        .post("/api/follow-through/feedback")
        .send({ signalId: "test", domain: "task", action: "upvote" })
        .expect(401);
    });
  });
});
