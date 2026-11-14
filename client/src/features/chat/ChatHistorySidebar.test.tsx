import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { useChatStore } from "@/stores/chatStore";

const chatApi = vi.hoisted(() => ({ deleteSession: vi.fn(), fetchSessions: vi.fn() }));
vi.mock("@/services/chatApi", () => chatApi);
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({ formatTime: () => "10:00", formatDate: () => "Mon" }) }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

const session = (id: string, title: string) => ({ id, title, messageCount: 2, lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

function show(path: string) {
  const location = memoryLocation({ path, record: true });
  render(<Router hook={location.hook}><ChatHistorySidebar /></Router>);
  return location;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  chatApi.deleteSession.mockResolvedValue({ message: "deleted" });
  const sessions = [session("open-thread", "Open thread"), session("other-thread", "Other thread")];
  chatApi.fetchSessions.mockResolvedValue({ sessions });
  useChatStore.setState({ sessions, currentSessionId: "open-thread", messages: [], isLoadingSessions: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ChatHistorySidebar delete", () => {
  it("leaves the deleted conversation's URL when the open thread is deleted", async () => {
    const location = show("/chat/open-thread");
    const row = await screen.findByRole("button", { name: "Open conversation Open thread" });
    fireEvent.click(row.querySelector('[aria-label="Delete conversation"]') as Element);
    await waitFor(() => expect(location.history.at(-1)).toBe("/chat"));
    expect(useChatStore.getState().currentSessionId).toBeNull();
  });

  it("keeps the current URL when a different thread is deleted", async () => {
    const location = show("/chat/open-thread");
    const row = await screen.findByRole("button", { name: "Open conversation Other thread" });
    fireEvent.click(row.querySelector('[aria-label="Delete conversation"]') as Element);
    await waitFor(() => expect(chatApi.deleteSession).toHaveBeenCalledWith("other-thread"));
    expect(location.history.at(-1)).toBe("/chat/open-thread");
  });
});
