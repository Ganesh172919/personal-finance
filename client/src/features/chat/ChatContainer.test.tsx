import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ChatContainer } from "./ChatContainer";
import { useChatStore } from "@/stores/chatStore";

const api = vi.hoisted(() => ({ getWorkspaceFile: vi.fn() }));
vi.mock("@/lib/api/files", () => api);
vi.mock("./ChatMessageList", () => ({ ChatMessageList: () => null }));
vi.mock("./ChatSuggestions", () => ({ ChatSuggestions: ({ onSelect }: { onSelect: (text: string) => void }) => (
  <button type="button" onClick={() => onSelect("Analyze my spending")}>Starter suggestion</button>
) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const id = "507f1f77bcf86cd799439011";
const file = { id, fileId: "507f1f77bcf86cd799439012", originalName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 2000 };
const clients: QueryClient[] = [];
function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const location = memoryLocation({ path, record: true });
  return render(<Router hook={location.hook}><QueryClientProvider client={client}><ChatContainer /></QueryClientProvider></Router>);
}
beforeEach(() => {
  vi.resetAllMocks();
  useChatStore.setState({ currentSessionId: null, sessions: [], messages: [], isSending: false,
    isLoadingMessages: false, messageLoadError: null, sendMessage: vi.fn().mockResolvedValue(false), selectSession: vi.fn() });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("Starter suggestions", () => {
  it("sends in the freshly created empty session instead of abandoning it", async () => {
    useChatStore.setState({ currentSessionId: "fresh-session" });
    show("/chat/fresh-session");
    fireEvent.click(await screen.findByRole("button", { name: "Starter suggestion" }));
    await waitFor(() => expect(useChatStore.getState().sendMessage).toHaveBeenCalledWith("Analyze my spending", undefined));
    expect(useChatStore.getState().currentSessionId).toBe("fresh-session");
  });
});

describe("Chat links from Files", () => {
  it("loads the saved attachment and prefills a question without automatically sending it", async () => {
    api.getWorkspaceFile.mockResolvedValue({ file });
    show(`/chat?attachment=${id}&message=Quote%20the%20invoice`);
    expect(await screen.findByText("invoice.pdf")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message to your finance assistant" })).toHaveValue("Quote the invoice");
    expect(useChatStore.getState().sendMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(useChatStore.getState().sendMessage).toHaveBeenCalledWith("Quote the invoice", { narrative: false, fileIds: [id] }));
  });

  it("keeps a removed attachment removed when a session is created", async () => {
    api.getWorkspaceFile.mockResolvedValue({ file });
    show(`/chat?attachment=${id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Remove saved invoice.pdf" }));
    useChatStore.setState({ currentSessionId: "new-session" });
    await waitFor(() => expect(screen.queryByText("invoice.pdf")).not.toBeInTheDocument());
    expect(api.getWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("displays an attachment failure and retries without sending a question", async () => {
    api.getWorkspaceFile.mockRejectedValueOnce(new Error("Not found")).mockResolvedValueOnce({ file });
    show(`/chat?attachment=${id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be attached");
    fireEvent.click(screen.getByRole("button", { name: "Try attaching again" }));
    expect(await screen.findByText("invoice.pdf")).toBeInTheDocument();
    expect(useChatStore.getState().sendMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid file links without making a request", async () => {
    show("/chat?attachment=https://example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("document link is invalid");
    expect(api.getWorkspaceFile).not.toHaveBeenCalled();
  });
});
