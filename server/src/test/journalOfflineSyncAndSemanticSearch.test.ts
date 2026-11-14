import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import JournalEntryModel from "../models/journalEntryModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Financial Journal Offline Sync & Semantic Vector Search API", () => {
  const app = createApp();

  let userA: any;
  let cookieA = "";
  let csrfCookieA = "";
  let csrfTokenA = "";

  let userB: any;
  let cookieB = "";
  let csrfCookieB = "";
  let csrfTokenB = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create User A
    userA = await createAuthedUser();
    cookieA = userA.cookie;
    const csrfA = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookieA = (csrfA.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfTokenA = csrfA.body.csrf_token as string;

    // Create User B in a different Org
    userB = await createAuthedUser();
    cookieB = userB.cookie;
    const csrfB = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookieB = (csrfB.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfTokenB = csrfB.body.csrf_token as string;
  });

  it("synchronizes offline notes batch and deduplicates by clientDraftId", async () => {
    const offlineNotes = [
      {
        clientDraftId: "draft-uuid-001",
        title: "Emergency Fund Plan",
        recognizedText: "Save $5000 in high yield savings for rainy day cushion #emergency",
        strokes: [[{ x: 0.1, y: 0.2, t: 1000 }]],
        tags: ["emergency", "savings"],
        createdAt: new Date().toISOString(),
      },
      {
        clientDraftId: "draft-uuid-002",
        title: "Monthly Groceries & Dining",
        recognizedText: "Cut monthly groceries and dining out expenses down to $450 #budget",
        strokes: [[{ x: 0.3, y: 0.4, t: 2000 }]],
        tags: ["budget"],
        createdAt: new Date().toISOString(),
      },
    ];

    // First batch sync
    const res1 = await request(app)
      .post("/api/financial-journal/entries/batch-sync")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({ notes: offlineNotes })
      .expect(200);

    expect(res1.body.success).toBe(true);
    expect(res1.body.syncedCount).toBe(2);
    expect(res1.body.duplicatesSkipped).toBe(0);
    expect(res1.body.entries).toHaveLength(2);

    const firstEntry = res1.body.entries[0];
    expect(firstEntry.clientDraftId).toBe("draft-uuid-001");
    expect(firstEntry.tags).toContain("savings");
    expect(firstEntry.parsedIntent.amounts.some((a: any) => a.value === 5000)).toBe(true);
    expect(firstEntry.isDuplicate).toBe(false);

    // Second sync with an existing draft plus a new draft
    const mixedNotes = [
      {
        clientDraftId: "draft-uuid-001", // duplicate
        title: "Emergency Fund Plan Dup",
        recognizedText: "Save $5000 in high yield savings",
      },
      {
        clientDraftId: "draft-uuid-003", // new
        title: "Payoff Credit Card",
        recognizedText: "Pay off credit card loan balance of $1200 with 22% apr debt",
        tags: ["debt"],
      },
    ];

    const res2 = await request(app)
      .post("/api/financial-journal/entries/batch-sync")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({ notes: mixedNotes })
      .expect(200);

    expect(res2.body.success).toBe(true);
    expect(res2.body.syncedCount).toBe(1);
    expect(res2.body.duplicatesSkipped).toBe(1);
    expect(res2.body.entries).toHaveLength(2);

    const dup = res2.body.entries.find((e: any) => e.clientDraftId === "draft-uuid-001");
    expect(dup?.isDuplicate).toBe(true);

    const newEntry = res2.body.entries.find((e: any) => e.clientDraftId === "draft-uuid-003");
    expect(newEntry?.isDuplicate).toBe(false);
    expect(newEntry?.sentiment).toMatch(/concerned|urgent|neutral/);
  });

  it("performs semantic vector search with cosine similarity scoring and tag filtering", async () => {
    // Seed diverse journal entries for User A
    await request(app)
      .post("/api/financial-journal/entries/batch-sync")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        notes: [
          {
            clientDraftId: "note-savings",
            title: "Emergency Reserve",
            recognizedText: "Building an emergency fund reserve of $10,000 in cash cushion",
            tags: ["savings"],
          },
          {
            clientDraftId: "note-budget",
            title: "Food and Dining",
            recognizedText: "Tracking grocery supermarket expenses and dinner bills",
            tags: ["budget"],
          },
          {
            clientDraftId: "note-debt",
            title: "Credit Card Debt",
            recognizedText: "Aggressive credit card debt payoff strategy to eliminate high interest loan",
            tags: ["debt"],
          },
        ],
      })
      .expect(200);

    // 1. Search for "emergency savings cushion"
    const searchRes = await request(app)
      .get("/api/financial-journal/semantic-search")
      .set("Cookie", [cookieA, csrfCookieA])
      .query({ query: "emergency savings cushion", threshold: 0.1, limit: 5 })
      .expect(200);

    expect(searchRes.body.totalMatches).toBeGreaterThanOrEqual(1);
    const topResult = searchRes.body.results[0];
    expect(topResult.clientDraftId).toBe("note-savings");
    expect(topResult.similarityScore).toBeGreaterThan(0.3);

    // 2. Filter by tag "debt"
    const debtSearch = await request(app)
      .get("/api/financial-journal/semantic-search")
      .set("Cookie", [cookieA, csrfCookieA])
      .query({ query: "interest payoff", tag: "debt", threshold: 0.1 })
      .expect(200);

    expect(debtSearch.body.results.length).toBe(1);
    expect(debtSearch.body.results[0].clientDraftId).toBe("note-debt");
    expect(debtSearch.body.results[0].tags).toContain("debt");
  });

  it("enforces strict multi-tenant isolation on batch sync and semantic search", async () => {
    // Seed a private note for User A
    await request(app)
      .post("/api/financial-journal/entries/batch-sync")
      .set("Cookie", [cookieA, csrfCookieA])
      .set("X-CSRF-Token", csrfTokenA)
      .send({
        notes: [
          {
            clientDraftId: "user-a-secret-note",
            title: "User A Secret Investment",
            recognizedText: "User A confidential investment portfolio with 50 shares of ETF",
            tags: ["investing"],
          },
        ],
      })
      .expect(200);

    // User B searches for "confidential investment"
    const searchResB = await request(app)
      .get("/api/financial-journal/semantic-search")
      .set("Cookie", [cookieB, csrfCookieB])
      .query({ query: "confidential investment portfolio", threshold: 0.05 })
      .expect(200);

    // User B must get 0 results
    expect(searchResB.body.totalMatches).toBe(0);
    expect(searchResB.body.results).toHaveLength(0);

    // User B listing journal entries must see 0 entries
    const listResB = await request(app)
      .get("/api/financial-journal/entries")
      .set("Cookie", [cookieB, csrfCookieB])
      .expect(200);

    expect(listResB.body.entries).toHaveLength(0);
  });
});
