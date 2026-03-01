import { http, HttpResponse } from "msw";

/**
 * Default MSW request handlers for testing.
 * These mock the most commonly used API endpoints so component tests
 * don't need a running backend.
 */
export const handlers = [
  // Auth
  http.get("/api/auth/profile", () => {
    return HttpResponse.json({
      id: "user-1",
      name: "Test User",
      email: "test@finwise.dev",
      photoURL: null,
    });
  }),

  http.get("/api/auth/csrf-token", () => {
    return HttpResponse.json({ csrfToken: "test-csrf-token" });
  }),

  http.post("/api/auth/logout", () => {
    return HttpResponse.json({ ok: true });
  }),

  // Transactions
  http.get("/api/transactions", () => {
    return HttpResponse.json({
      transactions: [
        {
          _id: "tx-1",
          amount: -42.5,
          category: "Food",
          description: "Grocery Store",
          date: "2026-02-15T00:00:00Z",
          type: "expense",
        },
        {
          _id: "tx-2",
          amount: 3500,
          category: "Salary",
          description: "Monthly Salary",
          date: "2026-02-01T00:00:00Z",
          type: "income",
        },
      ],
      total: 2,
    });
  }),

  // Financial vitals / dashboard summary
  http.get("/api/transactions/summary", () => {
    return HttpResponse.json({
      totalIncome: 3500,
      totalExpenses: 1200,
      netSavings: 2300,
      savingsRate: 65.7,
      topCategories: [
        { category: "Food", amount: 450 },
        { category: "Transport", amount: 200 },
        { category: "Entertainment", amount: 150 },
      ],
    });
  }),

  // Budget envelopes
  http.get("/api/v1/finance/budgets/:periodKey/envelopes", () => {
    return HttpResponse.json({
      org_id: "org-1",
      period_key: "2026-02",
      currency: "USD",
      totals: { planned: 2000, spent: 1200, remaining: 800, unbudgeted_spent: 100 },
      envelopes: [
        { category: "Food", planned: 500, spent: 450, remaining: 50, currency: "USD", tx_count: 12, unbudgeted: false },
        { category: "Transport", planned: 300, spent: 200, remaining: 100, currency: "USD", tx_count: 8, unbudgeted: false },
      ],
    });
  }),

  // Entitlements
  http.get("/api/v1/usage/ledger", () => {
    return HttpResponse.json({ records: [], total: 0 });
  }),

  // Organizations
  http.get("/api/v1/orgs/me", () => {
    return HttpResponse.json([
      { _id: "org-1", name: "Personal", role: "owner" },
    ]);
  }),

  // AI memory
  http.get("/api/v1/ai/memory/search", () => {
    return HttpResponse.json({ records: [] });
  }),
];
