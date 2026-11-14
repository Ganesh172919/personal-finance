import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeVoice } from "@/lib/api/voice";
import { transcribeLiveVoice } from "@/lib/liveVoice";
import { LiveVoiceChat } from "./LiveVoiceChat";

vi.mock("@/lib/api/voice", () => ({ synthesizeVoice: vi.fn() }));
vi.mock("@/lib/liveVoice", () => ({ transcribeLiveVoice: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("live voice chat", () => {
  it("keeps the default transcript editable before sending", async () => {
    vi.mocked(transcribeLiveVoice).mockResolvedValue({ text: "How much did I spend?" });
    const onSend = vi.fn();
    render(<LiveVoiceChat initiallyOpen sessionId="session" onSend={onSend} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByRole("textbox", { name: "Voice transcript" })).toHaveValue("How much did I spend?");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends an opted-in microphone turn and listens again after speech ends", async () => {
    const player = document.createElement("audio");
    player.src = "data:audio/wav;base64,AAAA";
    player.play = vi.fn().mockResolvedValue(undefined);
    player.pause = vi.fn();
    vi.stubGlobal("Audio", vi.fn(function () { return player; }));
    vi.mocked(transcribeLiveVoice).mockResolvedValueOnce({ text: "How much did I spend?" })
      .mockImplementationOnce(() => new Promise(() => undefined));
    vi.mocked(synthesizeVoice).mockResolvedValue({
      provider: "gnani_timbre_live", audioBase64: "AAAA", mimeType: "audio/wav",
    } as Awaited<ReturnType<typeof synthesizeVoice>>);
    const onSend = vi.fn().mockResolvedValue("You spent one hundred rupees.");
    render(<LiveVoiceChat initiallyOpen sessionId="session" onSend={onSend} disabled={false} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hands-free conversation" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    await screen.findByRole("button", { name: "Stop playback" });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("How much did I spend?");
    expect(synthesizeVoice).toHaveBeenCalledTimes(1);
    await act(async () => player.dispatchEvent(new Event("ended")));
    await waitFor(() => expect(transcribeLiveVoice).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Cancel capture" }));
    expect(vi.mocked(transcribeLiveVoice).mock.lastCall?.[0].signal.aborted).toBe(true);
  });
});
