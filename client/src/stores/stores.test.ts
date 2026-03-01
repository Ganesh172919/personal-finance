import { describe, it, expect, beforeEach } from "vitest";
import { useAIStore } from "@/stores/aiStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCommandBarStore } from "@/stores/commandBarStore";

describe("aiStore", () => {
  beforeEach(() => {
    useAIStore.getState().reset();
  });

  it("starts in idle phase", () => {
    expect(useAIStore.getState().phase).toBe("idle");
    expect(useAIStore.getState().activeAgent).toBeNull();
    expect(useAIStore.getState().traceEntries).toHaveLength(0);
  });

  it("transitions through phases", () => {
    const store = useAIStore.getState();
    store.setPhase("routing");
    expect(useAIStore.getState().phase).toBe("routing");

    store.setPhase("analyzing");
    expect(useAIStore.getState().phase).toBe("analyzing");
  });

  it("pushes trace entries and tracks active agent", () => {
    const store = useAIStore.getState();

    store.pushTraceEntry({
      agent: "FinanceAnalyst",
      startedAt: new Date().toISOString(),
      status: "running",
    });

    const state = useAIStore.getState();
    expect(state.traceEntries).toHaveLength(1);
    expect(state.activeAgent).toBe("FinanceAnalyst");
    expect(state.traceEntries[0]?.agent).toBe("FinanceAnalyst");
  });

  it("sets error state", () => {
    const store = useAIStore.getState();
    store.setError("Something went wrong");

    const state = useAIStore.getState();
    expect(state.phase).toBe("error");
    expect(state.errorMessage).toBe("Something went wrong");
  });

  it("resets to initial state", () => {
    const store = useAIStore.getState();
    store.setPhase("analyzing");
    store.pushTraceEntry({
      agent: "Agent1",
      startedAt: new Date().toISOString(),
      status: "done",
    });

    store.reset();

    const state = useAIStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.activeAgent).toBeNull();
    expect(state.traceEntries).toHaveLength(0);
    expect(state.errorMessage).toBeNull();
  });
});

describe("orgStore", () => {
  beforeEach(() => {
    useOrgStore.getState().setActiveOrg(null);
  });

  it("starts with null activeOrgId", () => {
    expect(useOrgStore.getState().activeOrgId).toBeNull();
  });

  it("sets active org", () => {
    useOrgStore.getState().setActiveOrg("org-123");
    expect(useOrgStore.getState().activeOrgId).toBe("org-123");
  });

  it("clears active org", () => {
    useOrgStore.getState().setActiveOrg("org-123");
    useOrgStore.getState().setActiveOrg(null);
    expect(useOrgStore.getState().activeOrgId).toBeNull();
  });
});

describe("commandBarStore", () => {
  beforeEach(() => {
    useCommandBarStore.setState({ isOpen: false, history: [] });
  });

  it("starts closed with empty history", () => {
    const state = useCommandBarStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.history).toHaveLength(0);
  });

  it("opens and closes", () => {
    useCommandBarStore.getState().open();
    expect(useCommandBarStore.getState().isOpen).toBe(true);

    useCommandBarStore.getState().close();
    expect(useCommandBarStore.getState().isOpen).toBe(false);
  });

  it("toggles", () => {
    useCommandBarStore.getState().toggle();
    expect(useCommandBarStore.getState().isOpen).toBe(true);

    useCommandBarStore.getState().toggle();
    expect(useCommandBarStore.getState().isOpen).toBe(false);
  });

  it("tracks command history with deduplication", () => {
    const store = useCommandBarStore.getState();
    store.pushHistory("show budget");
    store.pushHistory("add transaction");
    store.pushHistory("show budget"); // duplicate — should move to front

    const history = useCommandBarStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0]).toBe("show budget");
    expect(history[1]).toBe("add transaction");
  });

  it("limits history to 20 items", () => {
    const store = useCommandBarStore.getState();
    for (let i = 0; i < 25; i++) {
      store.pushHistory(`command-${i}`);
    }
    expect(useCommandBarStore.getState().history).toHaveLength(20);
  });
});
