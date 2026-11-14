import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChatMessage } from "./ChatMessage";
import { synthesizeVoice } from "@/lib/api/voice";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/voice", () => ({ synthesizeVoice: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "QA" } }) }));
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({
  configQuery: { data: { features: { tasks_enabled: false } } }, formatMoney: String, formatTime: () => "12:00",
}) }));
const content = "Saved USD 25.25 toward USD 1250.50. Source: page 1.";
const clients: QueryClient[] = [];
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
function renderMessage(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const client = new QueryClient(); clients.push(client);
  render(<QueryClientProvider client={client}><ChatMessage message={{ id: "answer", sessionId: "chat", role: "assistant", content, createdAt: "2026-11-06T00:00:00Z" }} /></QueryClientProvider>);
}
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); vi.clearAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

it("waits for the actual clipboard write before confirming and retains the exact quote", async () => {
  let finish!: () => void;
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  renderMessage(writeText);
  fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
  expect(writeText).toHaveBeenCalledWith(content);
  expect(screen.queryByRole("button", { name: "Response copied" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copying response" })).toBeDisabled();
  await act(async () => { finish(); });
  expect(screen.getByRole("button", { name: "Response copied" })).toBeInTheDocument();
});

it("reports clipboard rejection without claiming the response was copied", async () => {
  renderMessage(vi.fn().mockRejectedValue(new Error("Clipboard unavailable")));
  fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy failed", variant: "destructive" })));
  expect(screen.queryByRole("button", { name: "Response copied" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy response" })).toBeEnabled();
});

it("does not play the demo chime as the spoken answer", async () => {
  vi.mocked(synthesizeVoice).mockResolvedValueOnce({
    provider: "gnani_timbre_fallback",
    audioBase64: "ZGVtbw==",
    mimeType: "audio/wav",
    language: "en-IN",
    voiceGender: "female",
    model: "Demo",
  });
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  try {
    renderMessage(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Listen to response" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Voice playback unavailable" })));
    expect(play).not.toHaveBeenCalled();
  } finally {
    play.mockRestore();
  }
});

it("keeps numbered plan headings on the same line as their list marker", () => {
  const client = new QueryClient(); clients.push(client);
  const plan = "1. Executive summary\nCash flow is positive.\n\n2. Key metrics\n\nNet USD 10.";
  render(<QueryClientProvider client={client}><ChatMessage message={{ id: "plan", sessionId: "chat", role: "assistant", content: plan, createdAt: "2026-11-06T00:00:00Z" }} /></QueryClientProvider>);
  const list = screen.getByText(/Executive summary/).closest("ol");
  expect(list).not.toBeNull();
  // Loose items render a <p> inside <li>; an inside marker would sit alone above that block.
  expect(list).toHaveClass("list-outside");
  expect(list).not.toHaveClass("list-inside");
});
