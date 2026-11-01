/**
 * @fileoverview Chat Store Tests
 *
 * Tests for the chat Zustand store covering:
 * - Session management (create, select, delete, rename)
 * - Message sending with optimistic updates
 * - Workflow phase tracking
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "./chatStore";
import * as chatApi from "@/services/chatApi";

// Mock dependencies
vi.mock("@/services/chatApi", () => ({
  fetchSessions: vi.fn().mockResolvedValue({ sessions: [
    { id: "session-1", title: "Test Session 1", createdAt: "2026-01-01T00:00:00Z" },
    { id: "session-2", title: "Test Session 2", createdAt: "2026-01-02T00:00:00Z" },
  ] }),
  createSession: vi.fn().mockResolvedValue({
    id: "session-new",
    title: "New Session",
    createdAt: "2026-01-03T00:00:00Z",
  }),
  fetchMessages: vi.fn().mockResolvedValue({ messages: [
    { id: "msg-1", role: "user", content: "Hello", createdAt: "2026-01-01T00:00:00Z" },
    { id: "msg-2", role: "assistant", content: "Hi there!", createdAt: "2026-01-01T00:00:01Z" },
  ] }),
  sendMessage: vi.fn().mockResolvedValue({
    userMessage: { id: "msg-user", role: "user", content: "Test", createdAt: "2026-01-01T00:00:02Z" },
    assistantMessage: { id: "msg-asst", role: "assistant", content: "Response", createdAt: "2026-01-01T00:00:03Z" },
  }),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  renameSession: vi.fn().mockImplementation(async (id: string, title: string) => ({ id, title })),
}));

vi.mock("@/lib/runtimeLogger", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

describe("chatStore", () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoadingSessions: false,
      isLoadingMessages: false,
      messageLoadError: null,
      isSending: false,
      currentPhase: null,
      currentAgent: null,
      phaseHistory: [],
    });
    vi.clearAllMocks();
    useChatStore.getState().bindDataScope("test-owner");
  });

  it("ignores a late session list after switching away and back to the same owner", async () => {
    let finish!: (value: Awaited<ReturnType<typeof chatApi.fetchSessions>>) => void;
    vi.mocked(chatApi.fetchSessions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = useChatStore.getState().loadSessions();
    useChatStore.getState().bindDataScope("other-owner");
    useChatStore.getState().bindDataScope("test-owner");
    finish({ sessions: [{ id: "private-old-session" }] as never[],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    await pending;
    expect(useChatStore.getState().sessions).toEqual([]);
    expect(useChatStore.getState().isLoadingSessions).toBe(false);
  });

  it("does not let an old send overwrite messages or unlock a new owner's send", async () => {
    let finish!: (value: never) => void;
    vi.mocked(chatApi.sendMessage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    useChatStore.setState({ currentSessionId: "same-session-id" });
    const pending = useChatStore.getState().sendMessage("Old question");
    useChatStore.getState().bindDataScope("other-owner");
    useChatStore.setState({ currentSessionId: "same-session-id", isSending: true });
    finish({ userMessage: { id: "old-user" }, assistantMessage: { id: "old-private-answer" } } as never);
    expect(await pending).toBe(false);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().isSending).toBe(true);
  });

  it("does not auto-send after a previous owner's session creation completes", async () => {
    let finish!: (value: never) => void;
    vi.mocked(chatApi.createSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = useChatStore.getState().sendMessage("Old question");
    useChatStore.getState().bindDataScope("other-owner");
    finish({ id: "old-session" } as never);
    expect(await pending).toBe(false);
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().currentSessionId).toBeNull();
  });

  describe("initial state", () => {
    it("has empty sessions and messages", () => {
      const state = useChatStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.messages).toEqual([]);
      expect(state.currentSessionId).toBeNull();
    });

    it("is not loading initially", () => {
      const state = useChatStore.getState();
      expect(state.isLoadingSessions).toBe(false);
      expect(state.isLoadingMessages).toBe(false);
      expect(state.isSending).toBe(false);
    });

    it("has no workflow phase", () => {
      const state = useChatStore.getState();
      expect(state.currentPhase).toBeNull();
      expect(state.currentAgent).toBeNull();
      expect(state.phaseHistory).toEqual([]);
    });
  });

  describe("loadSessions", () => {
    it("loads sessions from API", async () => {
      await useChatStore.getState().loadSessions();
      const state = useChatStore.getState();
      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].id).toBe("session-1");
      expect(state.isLoadingSessions).toBe(false);
    });

    it("sets loading state during fetch", async () => {
      const promise = useChatStore.getState().loadSessions();
      expect(useChatStore.getState().isLoadingSessions).toBe(true);
      await promise;
      expect(useChatStore.getState().isLoadingSessions).toBe(false);
    });
  });

  describe("createSession", () => {
    it("creates a new session and adds to list", async () => {
      const session = await useChatStore.getState().createSession();
      expect(session).not.toBeNull();
      expect(session?.id).toBe("session-new");
      expect(useChatStore.getState().sessions).toContainEqual(
        expect.objectContaining({ id: "session-new" })
      );
    });
  });

  describe("selectSession", () => {
    it("loads messages when a persisted session is already selected", async () => {
      useChatStore.setState({ currentSessionId: "session-1", messages: [] });
      await useChatStore.getState().selectSession("session-1");
      expect(useChatStore.getState().messages).toHaveLength(2);
    });

    it("does not request the same session twice while it loads", async () => {
      const first = useChatStore.getState().selectSession("session-1");
      await useChatStore.getState().selectSession("session-1");
      await first;
      expect(chatApi.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it("ignores an old message request after selecting a new conversation", async () => {
      let finishOld!: (value: Awaited<ReturnType<typeof chatApi.fetchMessages>>) => void;
      vi.mocked(chatApi.fetchMessages).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
      const oldRequest = useChatStore.getState().selectSession("old-session");
      await useChatStore.getState().selectSession("session-1");
      finishOld({ messages: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
      await oldRequest;
      expect(useChatStore.getState().currentSessionId).toBe("session-1");
      expect(useChatStore.getState().messages).toHaveLength(2);
    });

    it("loads messages for selected session", async () => {
      await useChatStore.getState().selectSession("session-1");
      const state = useChatStore.getState();
      expect(state.currentSessionId).toBe("session-1");
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].role).toBe("user");
    });

    it("sets loading state during message fetch", async () => {
      const promise = useChatStore.getState().selectSession("session-1");
      expect(useChatStore.getState().isLoadingMessages).toBe(true);
      await promise;
      expect(useChatStore.getState().isLoadingMessages).toBe(false);
    });
  });

  it("keeps a late reply out of a different active conversation", async () => {
    let finishSend!: (value: Awaited<ReturnType<typeof chatApi.sendMessage>>) => void;
    vi.mocked(chatApi.sendMessage).mockImplementationOnce(() => new Promise(resolve => { finishSend = resolve; }));
    useChatStore.setState({ currentSessionId: "old-session" });
    const sending = useChatStore.getState().sendMessage("Hello");
    useChatStore.setState({ currentSessionId: "new-session", messages: [], currentPhase: null });
    finishSend({
      userMessage: { id: "u", sessionId: "old-session", role: "user", content: "Hello", createdAt: "2026-10-25T00:00:00Z" },
      assistantMessage: { id: "a", sessionId: "old-session", role: "assistant", content: "Answer", createdAt: "2026-10-25T00:00:01Z" },
    });
    await sending;
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().currentPhase).toBeNull();
  });

  it("prevents duplicate sends while creating the first conversation", async () => {
    const first = useChatStore.getState().sendMessage("Hello");
    const second = useChatStore.getState().sendMessage("Hello");
    await Promise.all([first, second]);
    expect(chatApi.createSession).toHaveBeenCalledTimes(1);
    expect(chatApi.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("exposes a history failure and recovers when the same conversation is retried", async () => {
    vi.mocked(chatApi.fetchMessages).mockRejectedValueOnce(new Error("API unavailable"));
    await useChatStore.getState().selectSession("session-1");
    expect(useChatStore.getState().messageLoadError).toMatch(/could not be loaded/);
    expect(useChatStore.getState().messages).toEqual([]);
    await useChatStore.getState().selectSession("session-1");
    expect(useChatStore.getState().messageLoadError).toBeNull();
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it("does not show a stale loading error in another conversation", async () => {
    let rejectLoad!: (error: Error) => void;
    vi.mocked(chatApi.fetchMessages).mockImplementationOnce(() => new Promise((_, reject) => { rejectLoad = reject; }));
    const loading = useChatStore.getState().selectSession("old-session");
    useChatStore.setState({ currentSessionId: "new-session", messages: [], messageLoadError: null });
    rejectLoad(new Error("Old request failed"));
    await loading;
    expect(useChatStore.getState().messageLoadError).toBeNull();
  });

  it("reports a failed send to the composer and removes only the optimistic message", async () => {
    vi.mocked(chatApi.sendMessage).mockRejectedValueOnce(new Error("API unavailable"));
    useChatStore.setState({ currentSessionId: "session-1", messages: [] });
    const sent = await useChatStore.getState().sendMessage("Keep this draft");
    expect(sent).toBe(false);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().isSending).toBe(false);
    expect(useChatStore.getState().currentPhase).toBe("error");
  });

  it("does not report success when the first conversation cannot be created", async () => {
    vi.mocked(chatApi.createSession).mockRejectedValueOnce(new Error("API unavailable"));
    expect(await useChatStore.getState().sendMessage("Keep this draft")).toBe(false);
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().isSending).toBe(false);
  });

  describe("workflow phase", () => {
    it("sets workflow phase", () => {
      useChatStore.getState().setWorkflowPhase("execution", "budget_planner");
      const state = useChatStore.getState();
      expect(state.currentPhase).toBe("execution");
      expect(state.currentAgent).toBe("budget_planner");
    });

    it("tracks phase history", () => {
      const store = useChatStore.getState();
      store.setWorkflowPhase("routing");
      store.setWorkflowPhase("execution", "income_analyzer");
      store.setWorkflowPhase("complete");

      const state = useChatStore.getState();
      expect(state.phaseHistory).toHaveLength(3);
      expect(state.phaseHistory[0].phase).toBe("routing");
      expect(state.phaseHistory[1].agent).toBe("income_analyzer");
    });

    it("clears workflow progress", () => {
      useChatStore.getState().setWorkflowPhase("execution", "budget_planner");
      useChatStore.getState().clearWorkflowProgress();

      const state = useChatStore.getState();
      expect(state.currentPhase).toBeNull();
      expect(state.currentAgent).toBeNull();
      expect(state.phaseHistory).toEqual([]);
    });
  });

  describe("deleteSession", () => {
    it("removes session from list", async () => {
      // First load sessions
      await useChatStore.getState().loadSessions();
      expect(useChatStore.getState().sessions).toHaveLength(2);

      // Delete one
      await useChatStore.getState().deleteSession("session-1");
      expect(useChatStore.getState().sessions).toHaveLength(1);
      expect(useChatStore.getState().sessions.find((s) => s.id === "session-1")).toBeUndefined();
    });
  });

  describe("renameSession", () => {
    it("updates session title", async () => {
      await useChatStore.getState().loadSessions();
      await useChatStore.getState().renameSession("session-1", "Renamed Session");

      const session = useChatStore.getState().sessions.find((s) => s.id === "session-1");
      expect(session?.title).toBe("Renamed Session");
    });
  });
});
