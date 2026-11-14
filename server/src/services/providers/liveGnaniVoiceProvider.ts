/**
 * @fileoverview Live Production Gnani AI Voice Provider.
 *
 * Implements IGnaniVoiceProvider with real HTTP REST requests to sovereign Gnani AI cloud endpoints:
 * 1. Prisma v3.0 STT: Multi-lingual Indic ASR with telephonic 8kHz DSP filtering.
 * 2. Timbre TTS: Natural sovereign regional Indic speech synthesis.
 * 3. Evon v3.3 30B: Sovereign MoE financial reasoning LLM.
 *
 * Uses a simulated provider when credentials are absent. Live STT failures
 * return an error so a sample transcript cannot reach the ledger.
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/liveGnaniVoiceProvider
 */

import axios from "axios";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { HttpError } from "../../middleware/httpError";
import {
  IGnaniVoiceProvider,
  VoiceTranscriptionOptions,
  VoiceTranscriptionResult,
  VoiceSynthesisOptions,
  VoiceSynthesisResult,
  VoiceExpenseExtractionResult,
} from "./gnaniProvider.interface";
import { MockGnaniVoiceProvider } from "./mockGnaniVoiceProvider";
import { analyzeSpeechAcoustics } from "../gnaniVoiceService";

const audioExtensions: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
};

export class LiveGnaniVoiceProvider implements IGnaniVoiceProvider {
  public readonly providerName = "live_gnani_cloud";
  private fallbackProvider: MockGnaniVoiceProvider;

  constructor(fallbackProvider?: MockGnaniVoiceProvider) {
    this.fallbackProvider = fallbackProvider || new MockGnaniVoiceProvider({ profile: "instant" });
  }

  /**
   * Transcribes raw audio buffer via Gnani Prisma v3.0 STT endpoint.
   */
  async transcribeAudio(
    buffer?: Buffer,
    options?: VoiceTranscriptionOptions
  ): Promise<VoiceTranscriptionResult> {
    const env = getEnv();
    const apiKey = env.GNANI_API_KEY;
    if (!apiKey) return this.fallbackProvider.transcribeAudio(buffer, options);

    const payloadBuffer =
      buffer ??
      options?.audioBuffer ??
      (options?.audioBase64 ? Buffer.from(options.audioBase64, "base64") : undefined);
    if (!payloadBuffer?.length) {
      throw new HttpError(400, "MISSING_AUDIO", "An audio recording is required for transcription");
    }

    const language = options?.language || "auto";
    const languageCode = language === "auto" ? "indic-auto" : language === "hi-en-IN" ? "hi-IN,en-IN" : language;
    const mimeType = options?.mimeType?.split(";")[0] || "audio/wav";
    const mode = options?.mode ?? (options?.codeMixed === false ? "transcribe" : "code-mix");
    const form = new FormData();
    form.append("audio_file", new Blob([Uint8Array.from(payloadBuffer)], { type: mimeType }), `recording.${audioExtensions[mimeType] ?? "audio"}`);
    form.append("model", "prisma-v3.0");
    form.append("language_code", languageCode);
    form.append("format", mode === "code-mix" ? "codemix" : mode);

    try {
      const { data } = await axios.post(env.GNANI_STT_URL, form, {
        headers: { "X-API-Key-ID": apiKey },
        timeout: 60_000,
      });
      if (data?.success !== true || typeof data.transcript !== "string") {
        throw new Error("Unexpected Prisma transcription response");
      }

      if (data.truncated === true) {
        throw new HttpError(422, "TRANSCRIPT_TRUNCATED", "The transcript was cut short. Try a shorter recording.");
      }

      const transcript = data.transcript.trim();
      const detectedLanguage = data.detected_language_code || language;
      return {
        transcript,
        detectedLanguage,
        confidence: Number(data.confidence ?? 0),
        model: "Prisma v3.0 (STT)",
        telephonicProcessed: false,
        provider: "gnani_prisma_v3_live",
        durationSeconds: Number(data.duration ?? 0),
        speechAnalytics: analyzeSpeechAcoustics({ transcript, language: detectedLanguage }),
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.warn({ err: err instanceof Error ? err.message : undefined }, "Live Gnani Prisma transcription failed");
      throw new HttpError(502, "GNANI_TRANSCRIPTION_FAILED", "Gnani could not transcribe the recording. Try again or enter the transcript.");
    }
  }

  /**
   * Synthesizes Indic speech via Gnani Timbre TTS endpoint.
   */
  async synthesizeSpeech(
    text: string,
    options?: VoiceSynthesisOptions
  ): Promise<VoiceSynthesisResult> {
    const env = getEnv();
    const apiKey = env.GNANI_API_KEY;
    const language = options?.language || "hi-IN";
    const voiceGender = options?.voiceGender || options?.gender || "female";
    const languageCode = language === "hi-en-IN" ? "hi-en" : language === "or-IN" ? "auto" : language;
    const speed = Math.min(1.15, Math.max(0.85, options?.speakingRate ?? options?.speed ?? 1));
    const sampleRate = 16_000;

    if (apiKey) {
      try {
        const response = await axios.post(
          env.GNANI_TTS_URL,
          {
            text,
            language: languageCode,
            voice: voiceGender === "male" ? "Avinash" : "Shivani",
            speed,
            model: "timbre-v3.0",
            audio_config: {
              sample_rate: sampleRate,
              num_channels: 1,
              sample_width: 2,
              encoding: "linear_pcm",
              container: "wav",
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-API-Key-ID": apiKey,
            },
            responseType: "arraybuffer",
            timeout: 15000,
            signal: options?.signal,
          }
        );

        const audioBuffer = Buffer.from(response.data);
        if (
          audioBuffer.length <= 44 ||
          audioBuffer.toString("ascii", 0, 4) !== "RIFF" ||
          audioBuffer.toString("ascii", 8, 12) !== "WAVE"
        ) {
          throw new Error("Unexpected Timbre audio response");
        }

        return {
          audioBuffer,
          audioBase64: audioBuffer.toString("base64"),
          contentType: "audio/wav",
          mimeType: "audio/wav",
          durationMs: Math.round(((audioBuffer.length - 44) / (sampleRate * 2)) * 1_000),
          language,
          voiceGender,
          model: "Timbre v3.0 (TTS)",
          provider: "gnani_timbre_live",
        };
      } catch (err: any) {
        options?.signal?.throwIfAborted();
        logger.warn(
          { err: err?.message },
          "Live Gnani Timbre TTS request failed; degrading to synthetic chime fallback"
        );
      }
    }

    return this.fallbackProvider.synthesizeSpeech(text, options);
  }

  /**
   * Extracts structured financial transaction parameters via Gnani Evon 30B reasoning.
   */
  async extractExpense(
    transcript: string,
    options?: { language?: string; currency?: string }
  ): Promise<VoiceExpenseExtractionResult> {
    const env = getEnv();
    const apiKey = env.GNANI_REASONING_API_KEY;
    const preferredCurrency = options?.currency || "INR";

    if (env.GNANI_REASONING_URL) {
      try {
        const response = await axios.post(
          `${env.GNANI_REASONING_URL}/chat/completions`,
          {
            model: env.GNANI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are Gnani Evon 30B, an expert Indian financial reasoning model. Extract structured transaction data from the spoken input. Return JSON with keys: amount (number), category (string: Groceries, Food & Dining, Shopping, Transport, Utilities, Entertainment, Investment, Health, Education, Other), merchantName (string), description (string), paymentMethod (UPI, Cash, Credit Card, Debit Card, NetBanking), type ('expense' | 'income' | 'investment'), confidence (0.0 to 1.0), and reasoning (brief sentence).",
              },
              {
                role: "user",
                content: transcript,
              },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            timeout: 10000,
          }
        );

        const parsed = JSON.parse(response.data?.choices?.[0]?.message?.content || "{}");
        if (parsed.amount && !isNaN(Number(parsed.amount))) {
          const confidence = Number(parsed.confidence ?? 0.95);
          return {
            amount: Number(parsed.amount),
            category: parsed.category || "General",
            merchantName: parsed.merchantName || "Unknown Merchant",
            description: parsed.description || transcript,
            paymentMethod: parsed.paymentMethod || "UPI",
            type: parsed.type === "income" || parsed.type === "investment" ? parsed.type : "expense",
            confidence,
            confidenceScore: confidence,
            reasoning: parsed.reasoning || "Parsed via Gnani Evon 30B reasoning",
            reasoningNotes: parsed.reasoning || "Parsed via Gnani Evon 30B reasoning",
            reasoningProvider: "gnani_evon",
            currency: preferredCurrency,
            rawTranscript: transcript,
            speechAnalytics: analyzeSpeechAcoustics({ transcript }),
          };
        }
      } catch (err: any) {
        logger.warn(
          { err: err?.message },
          "Live Gnani Evon reasoning request failed; degrading to deterministic Indic parser"
        );
      }
    }

    return this.fallbackProvider.extractExpense(transcript, options);
  }
}
