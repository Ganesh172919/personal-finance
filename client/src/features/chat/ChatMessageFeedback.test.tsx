import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { IChatMessage } from "@/types/chat.types";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";

const toast = vi.hoisted(() => vi.fn());
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast }), toast: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "QA" } }) }));
vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    configQuery: { data: { features: { tasks_enabled: false } } },
    formatMoney: String,
    formatTime: () => "12:00",
  }),
}));
vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiClient")>();
  return { ...actual, submitAgentOutputFeedback: submit };
});

const clients: QueryClient[] = [];
const assistant = (metadata: IChatMessage["metadata"] = {}): IChatMessage => ({
  id: "m2",
  sessionId: "chat",
  role: "assistant",
  content: "Your spend was fine.",
  createdAt: "2026-11-06T00:00:00Z",
  metadata: { agentOutputId: "out1", ...metadata },
});

const renderMessage = (message: IChatMessage) => {
  const client = new QueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ChatMessage message={message} />
    </QueryClientProvider>
  );
};

beforeEach(() => submit.mockResolvedValue({ success: true }));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.clearAllMocks();
  useChatStore.setState({ messages: [], isSending: false });
});

it("restores the persisted thumbs state after reload", () => {
  renderMessage(assistant({ feedback: { rating: "down", reasonCode: "unclear" } }));
  // Persisted rating renders as the selected (secondary) button; the details panel stays closed.
  expect(screen.getByTitle("Thumbs down").className).toContain("bg-secondary");
  expect(screen.getByTitle("Thumbs up").className).not.toContain("bg-secondary");
  expect(screen.queryByTestId("feedback-details")).not.toBeInTheDocument();
});

it("thumbs-down saves the rating, then submits reason chip and capped correction", async () => {
  renderMessage(assistant());
  fireEvent.click(screen.getByTitle("Thumbs down"));
  await waitFor(() => expect(submit).toHaveBeenCalledWith("out1", { rating: "down" }));
  expect(await screen.findByTestId("feedback-details")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Wrong number" }));
  const box = screen.getByLabelText("Suggested correction") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: "x".repeat(700) } });
  expect(box.value).toHaveLength(500);
  fireEvent.change(box, { target: { value: "Rent was 5000" } });
  fireEvent.click(screen.getByRole("button", { name: "Send details" }));

  await waitFor(() =>
    expect(submit).toHaveBeenLastCalledWith("out1", {
      rating: "down",
      reasonCode: "wrong_number",
      correction: "Rent was 5000",
    })
  );
  await waitFor(() => expect(screen.queryByTestId("feedback-details")).not.toBeInTheDocument());
});

it("thumbs-up never opens the details panel", async () => {
  renderMessage(assistant());
  fireEvent.click(screen.getByTitle("Thumbs up"));
  await waitFor(() => expect(submit).toHaveBeenCalledWith("out1", { rating: "up" }));
  expect(screen.queryByTestId("feedback-details")).not.toBeInTheDocument();
});

it("regenerate resends the previous question linked to this output with cache bypass", () => {
  const send = vi.fn().mockResolvedValue(true);
  const question: IChatMessage = {
    id: "m1",
    sessionId: "chat",
    role: "user",
    content: "How much did I spend?",
    createdAt: "2026-11-06T00:00:00Z",
  };
  const answer = assistant();
  useChatStore.setState({ messages: [question, answer], isSending: false, sendMessage: send } as any);
  renderMessage(answer);
  fireEvent.click(screen.getByRole("button", { name: "Regenerate response" }));
  expect(send).toHaveBeenCalledWith("How much did I spend?", { regenerateOf: "out1", bypassCache: true });
});
