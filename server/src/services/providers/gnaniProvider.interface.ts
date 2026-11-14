/**
 * @fileoverview Unified interface contracts and error types for Gnani AI voice providers.
 *
 * Implements the Provider Strategy Pattern decoupling live REST/WebSocket APIs
 * from deterministic offline mocks and multi-profile simulations.
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/gnaniProvider.interface
 */

import type { GnaniSpeechAnalytics } from "../gnaniVoiceService";

/**
 * Options for audio speech-to-text transcription via Prisma v3.0.
 */
export interface VoiceTranscriptionOptions {
  language?: string;
  telephonic?: boolean;
  codeMixed?: boolean;
  mode?: "transcribe" | "code-mix" | "verbatim" | "transliterate";
  sampleRate?: number;
  audioBuffer?: Buffer;
  audioBase64?: string;
  mimeType?: string;
}

/**
 * Result structure returned by voice transcription operations.
 */
export interface VoiceTranscriptionResult {
  transcript: string;
  confidence: number;
  detectedLanguage: string;
  durationSeconds: number;
  model: string;
  telephonicProcessed: boolean;
  provider: "gnani_prisma_v3_live" | "gnani_prisma_v3_fallback";
  words?: Array<{ word: string; startTime: number; endTime: number; confidence: number }>;
  speechAnalytics?: GnaniSpeechAnalytics;
}

/**
 * Options for text-to-speech synthesis via Timbre TTS.
 */
export interface VoiceSynthesisOptions {
  signal?: AbortSignal;
  language?: string;
  gender?: "female" | "male";
  voiceGender?: "female" | "male";
  speed?: number;
  speakingRate?: number;
  pitch?: number;
  sampleRate?: number;
  enableAudioTags?: boolean;
  emotion?: "neutral" | "celebratory" | "cautionary" | "urgent";
}

/**
 * Result structure returned by voice synthesis operations.
 */
export interface VoiceSynthesisResult {
  audioBuffer: Buffer;
  audioBase64: string;
  contentType: string;
  mimeType: string;
  durationMs: number;
  language: string;
  voiceGender: string;
  model: string;
  provider: "gnani_timbre_live" | "gnani_timbre_fallback";
}

/**
 * Structured transaction extracted from spoken voice transcripts via Evon reasoning.
 */
export interface VoiceExpenseExtractionResult {
  amount: number;
  currency: string;
  category: string;
  merchantName: string;
  description: string;
  paymentMethod: string;
  type: "expense" | "income" | "investment";
  confidence: number;
  confidenceScore: number;
  reasoning: string;
  reasoningNotes: string;
  reasoningProvider: "gnani_evon" | "rules";
  subCategory?: string;
  items?: Array<{ name: string; cost: number }>;
  rawTranscript: string;
  speechAnalytics?: GnaniSpeechAnalytics;
}

/**
 * Simulation latency and error injection profiles.
 * - instant: 0ms delay for lightning-fast unit tests and CI builds (<10ms).
 * - realistic_latency: Models sovereign cloud RTT and neural inference (550ms ± 15% jitter).
 * - chaos_error: Injects 429, 503, or 504 errors to test fault tolerance and fallbacks.
 */
export type SimulationProfile = "instant" | "realistic_latency" | "chaos_error";

/**
 * Base custom error for Gnani AI service failures.
 */
export class GnaniVoiceError extends Error {
  public statusCode: number;
  public errorCode: string;

  constructor(message: string, statusCode: number = 500, errorCode: string = "GNANI_VOICE_ERROR") {
    super(message);
    this.name = "GnaniVoiceError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GnaniRateLimitError extends GnaniVoiceError {
  constructor(message: string = "Rate limit exceeded for Prisma/Timbre: 60 requests/min. Backoff 2s required.") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "GnaniRateLimitError";
  }
}

export class GnaniServiceUnavailableError extends GnaniVoiceError {
  constructor(message: string = "Gnani sovereign model cluster temporarily unreachable. Triggering offline fallback.") {
    super(message, 503, "SERVICE_UNAVAILABLE");
    this.name = "GnaniServiceUnavailableError";
  }
}

export class GnaniTimeoutError extends GnaniVoiceError {
  constructor(message: string = "Acoustic synthesis inference timed out after 15000ms.") {
    super(message, 504, "GATEWAY_TIMEOUT");
    this.name = "GnaniTimeoutError";
  }
}

export class GnaniAudioDecodeError extends GnaniVoiceError {
  constructor(message: string = "Audio payload corrupted or unsupported codec.") {
    super(message, 400, "AUDIO_DECODE_ERROR");
    this.name = "GnaniAudioDecodeError";
  }
}

/**
 * Uniform provider interface for Gnani AI Speech-to-Text (Prisma),
 * Text-to-Speech (Timbre), and Indic NLU / Financial Reasoning (Evon).
 */
export interface IGnaniVoiceProvider {
  readonly providerName: string;

  /**
   * Transcribes raw audio buffer or base64 audio payload into text.
   */
  transcribeAudio(buffer?: Buffer, options?: VoiceTranscriptionOptions): Promise<VoiceTranscriptionResult>;

  /**
   * Synthesizes text into high-fidelity Indic speech or audible confirmation audio.
   */
  synthesizeSpeech(text: string, options?: VoiceSynthesisOptions): Promise<VoiceSynthesisResult>;

  /**
   * Extracts structured financial transaction parameters from spoken transcripts.
   */
  extractExpense(transcript: string, options?: { language?: string; currency?: string }): Promise<VoiceExpenseExtractionResult>;
}
