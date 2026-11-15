import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveGnaniVoiceProvider } from "../../services/providers/liveGnaniVoiceProvider";
import { createClean16kHzWav } from "../e2e/fixtures/audioFixtures";

describe("Live Gnani speech API contract", () => {
  const provider = new LiveGnaniVoiceProvider();
  const wav = createClean16kHzWav(0.5);
  const requests = new Map<string, {
    headers: IncomingMessage["headers"];
    body: Buffer;
  }>();
  let server: ReturnType<typeof createServer>;
  let malformedAudioRemaining: number;
  let ttsRequests: number;

  beforeEach(async () => {
    requests.clear();
    malformedAudioRemaining = 0;
    ttsRequests = 0;
    server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.set(request.url!, { headers: request.headers, body: Buffer.concat(chunks) });

      if (request.url === "/stt/v3") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          success: true,
          transcript: "Paid ₹450 for groceries.",
          model: "prisma-v3.0",
          detected_language_code: "en-IN",
        }));
        return;
      }

      ttsRequests++;
      response.setHeader("Content-Type", "audio/wav");
      if (malformedAudioRemaining > 0) {
        malformedAudioRemaining--;
        response.end("Incomplete WAV");
        return;
      }
      response.end(wav);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing voice fixture server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    vi.stubEnv("GNANI_API_KEY", "voice-contract-test-key");
    vi.stubEnv("GNANI_STT_URL", `${baseUrl}/stt/v3`);
    vi.stubEnv("GNANI_TTS_URL", `${baseUrl}/api/v1/tts/inference`);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("uploads audio, the model and language hints as multipart fields", async () => {
    const result = await provider.transcribeAudio(wav, {
      language: "hi-en-IN",
      mimeType: "audio/wav",
      mode: "transliterate",
    });
    const request = requests.get("/stt/v3")!;
    expect(request.headers["x-api-key-id"]).toBe("voice-contract-test-key");
    const form = await new Response(Uint8Array.from(request.body), {
      headers: { "Content-Type": request.headers["content-type"]! },
    }).formData();
    expect(form.get("model")).toBe("prisma-v3.0");
    expect(form.get("language_code")).toBe("hi-IN,en-IN");
    expect(form.get("format")).toBe("transliterate");
    const file = form.get("audio_file") as File;
    expect(file.name).toBe("recording.wav");
    expect(file.type).toBe("audio/wav");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(wav);
    expect(result).toMatchObject({
      transcript: "Paid ₹450 for groceries.",
      detectedLanguage: "en-IN",
      provider: "gnani_prisma_v3_live",
    });
  });

  it("requests a named Timbre voice and returns playable PCM WAV bytes", async () => {
    const result = await provider.synthesizeSpeech("Aapka kharcha record ho gaya.", {
      language: "hi-en-IN",
      voiceGender: "male",
      speakingRate: 1.4,
    });
    const request = requests.get("/api/v1/tts/inference")!;
    expect(request.headers["x-api-key-id"]).toBe("voice-contract-test-key");
    expect(JSON.parse(request.body.toString("utf8"))).toEqual({
      text: "Aapka kharcha record ho gaya.",
      model: "timbre-v3.0",
      voice: "Avinash",
      language: "hi-en",
      speed: 1.15,
      audio_config: {
        sample_rate: 16000,
        num_channels: 1,
        sample_width: 2,
        encoding: "linear_pcm",
        container: "wav",
      },
    });
    expect(result).toMatchObject({
      audioBase64: wav.toString("base64"),
      durationMs: 500,
      mimeType: "audio/wav",
      provider: "gnani_timbre_live",
    });
    expect(ttsRequests).toBe(1);
  });

  it("retries a malformed successful Timbre response once", async () => {
    malformedAudioRemaining = 1;
    const result = await provider.synthesizeSpeech("The Moon shows phases.");
    expect(ttsRequests).toBe(2);
    expect(result.provider).toBe("gnani_timbre_live");
    expect(result.audioBuffer).toEqual(wav);
  });
});
