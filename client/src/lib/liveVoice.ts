import { apiClient } from "./api/core";
import { transcribeVoice } from "./api/voice";
import { buildApiUrl } from "./apiBase";
import { prepareVoiceRecording } from "./voiceRecording";

type LiveVoiceEvent =
  | { type: "ready" | "speech_start" | "processing" }
  | { type: "transcript"; text: string; language?: string };

async function requestMicrophone(signal: AbortSignal) {
  const permission = new AbortController();
  const wait = setTimeout(() => permission.abort(new Error("Microphone permission is still pending. Allow access or import an audio clip.")), 6_000);
  const activeSignal = AbortSignal.any([signal, permission.signal]);
  let removeListener: (() => void) | undefined;
  try {
    return await new Promise<MediaStream>((resolve, reject) => {
      const abort = () => reject(activeSignal.reason);
      activeSignal.addEventListener("abort", abort, { once: true });
      removeListener = () => activeSignal.removeEventListener("abort", abort);
      if (activeSignal.aborted) return abort();
      void navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      }).then(stream => {
        if (activeSignal.aborted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        resolve(stream);
      }, () => reject(new Error("Microphone access was denied or unavailable. Check your permissions or import a clip.")));
    });
  } finally {
    clearTimeout(wait);
    removeListener?.();
  }
}

export async function transcribeLiveVoice({
  clip, signal, onEvent, registerCommit,
}: {
  clip?: File;
  signal: AbortSignal;
  onEvent: (event: LiveVoiceEvent["type"]) => void;
  registerCommit: (commit: () => void) => void;
}): Promise<{ text: string; language?: string }> {
  let mic: MediaStream | undefined;
  let audio: AudioContext | undefined;
  let socket: WebSocket | undefined;
  let clipTimer: ReturnType<typeof setInterval> | undefined;
  let timeLimit: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  let audioBytes: Uint8Array | undefined;
  let preparedClip: Blob | undefined;
  let worklet: AudioWorkletNode | undefined;
  const stopAudio = () => {
    clearInterval(clipTimer);
    mic?.getTracks().forEach(track => track.stop());
    if (worklet) worklet.port.onmessage = null;
  };

  try {
    if (clip) {
      if (clip.size > 8 * 1024 * 1024) throw new Error("Choose a short audio file under 8 MB.");
      const wav = await prepareVoiceRecording(clip, false).catch(() => {
        throw new Error("Choose a supported audio clip of 30 seconds or less.");
      });
      audioBytes = new Uint8Array(await wav.slice(44).arrayBuffer());
      preparedClip = wav;
    } else {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
        throw new Error("Live microphone access requires a supported browser over HTTPS or localhost.");
      }
      audio = new AudioContext({ sampleRate: 16_000 });
      const resume = audio.resume();
      // Keep the context linked to the original user gesture while permission is pending.
      void resume.catch(() => {});
      mic = await requestMicrophone(signal);
      signal.throwIfAborted();
      await resume;
      await audio.audioWorklet.addModule(`${import.meta.env.BASE_URL}voice-pcm.worklet.js`);
    }
    signal.throwIfAborted();
    const { data } = await apiClient<{ data: { ticket: string } }>("/v1/voice/live-ticket", { method: "POST", signal });
    signal.throwIfAborted();
    const url = new URL(buildApiUrl("/v1/voice/live"), window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const connection = new WebSocket(url);
    socket = connection;

    return await new Promise((resolve, reject) => {
      const interrupted = () => reject(new Error("Live voice disconnected. Try again or type your question."));
      const abort = () => reject(signal.reason);
      timeLimit = setTimeout(() => reject(new Error("Gnani did not connect in time. Try again or type your question.")), 10_000);
      signal.addEventListener("abort", abort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", abort);
      connection.addEventListener("close", event => {
        reject(new Error(event.reason || "Live voice disconnected. Try again or type your question."));
      });
      connection.addEventListener("error", interrupted);
      connection.addEventListener("open", () => connection.send(data.ticket));
      connection.addEventListener("message", ({ data: payload }) => {
        let event: LiveVoiceEvent;
        try {
          event = JSON.parse(payload) as LiveVoiceEvent;
        } catch {
          interrupted();
          return;
        }
        if (event.type === "transcript") {
          resolve(event);
          return;
        }
        onEvent(event.type);
        if (event.type !== "ready") return;
        clearTimeout(timeLimit);

        const send = (frame: ArrayBuffer) => {
          if (connection.readyState !== WebSocket.OPEN) return;
          if (connection.bufferedAmount > 65_536) return interrupted();
          connection.send(frame);
        };
        let committed = false;
        const commit = () => {
          if (committed || connection.readyState !== WebSocket.OPEN) return;
          committed = true;
          stopAudio();
          onEvent("processing");
          connection.send("commit");
          clearTimeout(timeLimit);
          timeLimit = setTimeout(() => reject(new Error("Gnani did not return a transcript. Try again or type your question.")), 9_000);
        };
        registerCommit(commit);

        if (audioBytes) {
          let offset = 0;
          const bytes = audioBytes;
          clipTimer = setInterval(() => {
            if (offset >= bytes.length) return commit();
            const frame = new Uint8Array(1024);
            frame.set(bytes.subarray(offset, offset + frame.length));
            offset += frame.length;
            send(frame.buffer);
          }, 32);
        } else if (audio && mic) {
          try {
            worklet = new AudioWorkletNode(audio, "voice-pcm", { outputChannelCount: [1] });
            worklet.port.onmessage = ({ data: frame }: MessageEvent<ArrayBuffer>) => send(frame);
            audio.createMediaStreamSource(mic).connect(worklet).connect(audio.destination);
          } catch {
            reject(new Error("The browser could not capture live microphone audio."));
          }
        }
        timeLimit = setTimeout(commit, 29_000);
      });
    });
  } catch (error) {
    signal.throwIfAborted();
    if (!preparedClip) throw error;
    stopAudio();
    clearTimeout(timeLimit);
    socket?.close();
    onEvent("processing");
    const result = await transcribeVoice({ audioBlob: preparedClip, language: "auto" }, signal);
    if (result.provider !== "gnani_prisma_v3_live" || !result.transcript.trim()) throw error;
    return { text: result.transcript, language: result.detectedLanguage };
  } finally {
    removeAbortListener?.();
    stopAudio();
    clearTimeout(timeLimit);
    socket?.close();
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }
}
