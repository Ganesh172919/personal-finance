import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Square, Upload, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { synthesizeVoice } from "@/lib/api/voice";
import { transcribeLiveVoice } from "@/lib/liveVoice";
import { prepareChatSpeech } from "@/lib/chatSpeech";

type Phase = "permission" | "connecting" | "listening" | "transcribing" | "answering" | "preparing" | "speaking";

const phaseText: Record<Phase, string> = {
  permission: "Allow microphone access to start listening…",
  connecting: "Connecting to Gnani Prisma…",
  listening: "Listening. Pause when you finish speaking.",
  transcribing: "Transcribing with Gnani Prisma…",
  answering: "Waiting for the finance assistant…",
  preparing: "Preparing the spoken reply…",
  speaking: "Playing the Gnani Timbre reply…",
};

export function LiveVoiceChat({
  disabled, sessionId, onSend, initiallyOpen = false,
}: {
  disabled: boolean;
  sessionId: string | null;
  onSend: (text: string) => Promise<string | undefined>;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [handsFree, setHandsFree] = useState(false);
  const [phase, setPhase] = useState<Phase>();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState(false);
  const capture = useRef<AbortController | null>(null);
  const synthesis = useRef<AbortController | null>(null);
  const commit = useRef<(() => void) | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const activeSession = useRef(sessionId);
  const disabledRef = useRef(disabled);
  const stop = () => {
    revision.current++;
    capture.current?.abort();
    capture.current = null;
    synthesis.current?.abort();
    synthesis.current = null;
    commit.current = null;
    audio.current?.pause();
    audio.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => {
    const previous = activeSession.current;
    activeSession.current = sessionId;
    if (!previous || previous === sessionId) return;
    stop();
    setPhase(undefined);
    setDraft(null);
    setPlayback(false);
    setError("");
    setHandsFree(false);
  }, [sessionId]);

  const listen = async (clip?: File, autoSend = false) => {
    stop();
    setDraft(null);
    setPlayback(false);
    setError("");
    setPhase(clip ? "connecting" : "permission");
    const controller = new AbortController();
    capture.current = controller;
    let transcript: string | undefined;
    try {
      const result = await transcribeLiveVoice({
        clip,
        signal: controller.signal,
        registerCommit: next => { commit.current = next; },
        onEvent: event => {
          if (!controller.signal.aborted) {
            setPhase(event === "processing" || clip ? "transcribing" : "listening");
          }
        },
      });
      if (!controller.signal.aborted) {
        transcript = result.text;
        setDraft(transcript);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Voice transcription failed. Try again.");
    } finally {
      if (capture.current === controller) {
        capture.current = null;
        commit.current = null;
        setPhase(undefined);
      }
    }
    if (autoSend && transcript && !controller.signal.aborted && !disabledRef.current) {
      void send(transcript, !clip);
    }
  };

  const play = async (player: HTMLAudioElement) => {
    setError("");
    try {
      await player.play();
      if (audio.current === player && !player.ended) setPhase("speaking");
    } catch {
      if (audio.current === player) {
        setPhase(undefined);
        setError("Automatic playback is blocked. Select Play reply.");
      }
    }
  };

  const send = async (transcript: string, resumeListening = false) => {
    const text = transcript.trim();
    if (!text || disabledRef.current) return;
    const request = ++revision.current;
    setError("");
    setPhase("answering");
    try {
      const reply = await onSend(text);
      if (request !== revision.current) return;
      if (!reply) throw new Error("The message could not be sent. Your transcript is ready to retry.");
      setDraft(null);
      const speech = prepareChatSpeech(reply, 180, true);
      if (!speech.cappedText) return;
      setPhase("preparing");
      const controller = new AbortController();
      synthesis.current = controller;
      const result = await synthesizeVoice({ text: speech.cappedText, language: speech.language, voiceGender: "female" }, controller.signal);
      if (request !== revision.current) return;
      if (result.provider !== "gnani_timbre_live" || !result.audioBase64) {
        throw new Error("Live speech playback is unavailable. Your reply is in the conversation.");
      }
      const player = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
      audio.current = player;
      const finishPlayback = () => {
        if (audio.current === player) setPhase(undefined);
      };
      player.onended = () => {
        if (audio.current !== player) return;
        player.onended = finishPlayback;
        if (resumeListening && !disabledRef.current) void listen(undefined, true);
        else finishPlayback();
      };
      player.onerror = () => {
        if (audio.current !== player) return;
        setPhase(undefined);
        setPlayback(false);
        setError("Playback failed. Your reply is in the conversation.");
      };
      setPlayback(true);
      await play(player);
      return;
    } catch (err) {
      if (request === revision.current) setError(err instanceof Error ? err.message : "Voice reply unavailable.");
    } finally {
      if (request === revision.current) {
        synthesis.current = null;
        if (!audio.current?.src) setPhase(undefined);
      }
    }
  };

  return (
    <section aria-label="Live voice chat" className="border-t border-border bg-card/60 px-4 py-2">
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => {
        if (open) {
          stop();
          setPhase(undefined);
          setPlayback(false);
          setDraft(null);
          setError("");
          setHandsFree(false);
        }
        setOpen(!open);
      }}>
        <AudioLines aria-hidden="true" className="mr-2 size-4" /> {open ? "Close live voice" : "Live voice chat"}
      </Button>
      {open && <div className="space-y-2 pb-1 pt-2">
        <label className="flex w-fit items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={handsFree} disabled={Boolean(phase)} onChange={event => setHandsFree(event.target.checked)} />
          Hands-free conversation
        </label>
        <p className="text-xs text-muted-foreground">
          {handsFree
            ? "Gnani sends each completed turn, reads the start of the reply, and listens again after playback."
            : "Ask aloud and review the transcript before sending. Gnani reads the start of the reply."}
        </p>
        {phase && <p role="status" className="text-sm text-foreground">{phaseText[phase]}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {draft !== null && <textarea aria-label="Voice transcript" rows={2} maxLength={8000} className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm"
          value={draft} disabled={Boolean(phase)} onChange={event => setDraft(event.target.value)} />}
        <div className="flex flex-wrap items-center gap-2">
          {!phase && <>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void listen(undefined, handsFree)}>
              <Mic aria-hidden="true" className="mr-2 size-4" /> {playback ? "Ask a follow-up" : "Start listening"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" className="mr-2 size-4" /> Import audio clip
            </Button>
            {draft !== null && <Button type="button" size="sm" disabled={disabled || !draft.trim()} onClick={() => void send(draft)}>Send voice question</Button>}
            {playback && <Button type="button" size="sm" variant="outline" onClick={() => { if (audio.current) void play(audio.current); }}>
              <Volume2 aria-hidden="true" className="mr-2 size-4" /> Play reply
            </Button>}
          </>}
          {phase === "listening" && <Button type="button" size="sm" variant="outline" onClick={() => commit.current?.()}>Finish speaking</Button>}
          {(phase === "permission" || phase === "connecting" || phase === "listening" || phase === "transcribing") &&
            <Button type="button" size="sm" variant="ghost" onClick={() => { stop(); setPhase(undefined); }}>Cancel capture</Button>}
          {phase === "preparing" && <Button type="button" size="sm" variant="outline" onClick={() => {
            stop();
            setPhase(undefined);
          }}>Skip audio</Button>}
          {phase === "speaking" && <Button type="button" size="sm" variant="outline" onClick={() => {
            if (audio.current) {
              audio.current.onended = () => setPhase(undefined);
              audio.current.pause();
            }
            setPhase(undefined);
          }}>
            <Square aria-hidden="true" className="mr-2 size-4" /> Stop playback
          </Button>}
        </div>
        <input ref={fileInput} type="file" aria-label="Voice audio clip" accept="audio/*,.wav,.webm" hidden onChange={event => {
          const clip = event.target.files?.[0];
          event.target.value = "";
          if (clip && !phase && !disabled) void listen(clip, handsFree);
        }} />
      </div>}
    </section>
  );
}
