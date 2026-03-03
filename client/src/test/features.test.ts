import { describe, it, expect } from "vitest";


// ─── useNotifications Tests ─────────────────────────────

describe("useNotifications", () => {
  it("should export hook functions", async () => {
    const mod = await import("@/hooks/useNotifications");
    expect(mod.useNotifications).toBeDefined();
    expect(typeof mod.useNotifications).toBe("function");
  });
});

// ─── useKeyboardShortcuts Tests ─────────────────────────

describe("useKeyboardShortcuts", () => {
  it("should export the hook", async () => {
    const mod = await import("@/hooks/useKeyboardShortcuts");
    expect(mod.useKeyboardShortcuts).toBeDefined();
    expect(typeof mod.useKeyboardShortcuts).toBe("function");
  });
});

// ─── errorReporting Tests ───────────────────────────────

describe("errorReporting", () => {
  it("should have install, report, and addBreadcrumb", async () => {
    const { errorReporting } = await import("@/services/errorReporting");
    expect(typeof errorReporting.install).toBe("function");
    expect(typeof errorReporting.report).toBe("function");
    expect(typeof errorReporting.addBreadcrumb).toBe("function");
  });

  it("should not throw when install is called", async () => {
    const { errorReporting } = await import("@/services/errorReporting");
    expect(() => errorReporting.install()).not.toThrow();
  });
});

// ─── API Client Module Tests ────────────────────────────

describe("API v1 modules", () => {
  it("should export notifications API functions", async () => {
    const mod = await import("@/lib/api/v1/notifications");
    expect(mod.listNotifications).toBeDefined();
    expect(mod.markNotificationRead).toBeDefined();
    expect(mod.markAllNotificationsRead).toBeDefined();
  });

  it("should export analytics API functions", async () => {
    const mod = await import("@/lib/api/v1/analytics");
    expect(mod.getSpendingHeatmap).toBeDefined();
    expect(mod.getCategoryTrends).toBeDefined();
    expect(mod.getIncomeExpenseSummary).toBeDefined();
    expect(mod.getAccountBalances).toBeDefined();
    expect(mod.getTopMerchants).toBeDefined();
  });

  it("should export collaboration API functions", async () => {
    const mod = await import("@/lib/api/v1/collaboration");
    expect(mod.getActivityFeed).toBeDefined();
    expect(mod.listResourceComments).toBeDefined();
    expect(mod.createComment).toBeDefined();
    expect(mod.updateComment).toBeDefined();
    expect(mod.deleteComment).toBeDefined();
  });
});

// ─── commandBarStore Tests ──────────────────────────────

describe("commandBarStore", () => {
  it("should toggle open/close state", async () => {
    const { useCommandBarStore } = await import("@/stores/commandBarStore");
    const store = useCommandBarStore.getState();

    expect(store.isOpen).toBe(false);
    store.toggle();
    expect(useCommandBarStore.getState().isOpen).toBe(true);
    store.toggle();
    expect(useCommandBarStore.getState().isOpen).toBe(false);
  });

  it("should push history and deduplicate", async () => {
    const { useCommandBarStore } = await import("@/stores/commandBarStore");
    const store = useCommandBarStore.getState();

    store.pushHistory("query 1");
    store.pushHistory("query 2");
    store.pushHistory("query 1"); // duplicate — should move to top

    const history = useCommandBarStore.getState().history;
    expect(history[0]).toBe("query 1");
    expect(history[1]).toBe("query 2");
    expect(history.filter((h) => h === "query 1").length).toBe(1);
  });
});
