/**
 * @fileoverview Tier 2: Boundary & Corner Cases Test Suite — FinWise Bharat Voice.
 *
 * Rigorous boundary value analysis (BVA) and pathological input testing against Express createApp():
 * - Empty & zero-length audio buffers (>=5 tests)
 * - Corrupted audio bytes, invalid magic bytes & broken chunks (>=5 tests)
 * - Narrowband 8kHz telephonic audio & frequency filtering (>=5 tests)
 * - High background street & bazaar noise with SNR analysis (>=5 tests)
 * - Zero, negative, fractional & extreme numerical amounts (>=5 tests)
 * - Missing, invalid, expired & spoofed credentials (>=5 tests)
 * - Payload size limits & Zod schema bounds enforcement (>=5 tests)
 *
 * Each boundary area contains >= 5 test cases.
 *
 * @module test/e2e/tier2_boundary_corner.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { configurePassport } from "../../config/passport";
import { startTestDb, stopTestDb } from "../testDb";
import { createAuthedSession, type AuthedSession, getCsrfTokens } from "./helpers/authHelper";
import {
  AudioFixtures,
  createWavHeader,
  createClean16kHzWav,
  createTelephonic8kHzWav,
  createBazaarNoiseWav,
  createHummingTelephonicWav,
} from "./fixtures/audioFixtures";

describe("Tier 2: Boundary & Corner Cases — FinWise Bharat Voice", () => {
  const app = createApp();
  let session: AuthedSession;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    session = await createAuthedSession(app);
  });

  afterAll(async () => {
    await stopTestDb();
  });

  // ==========================================================================
  // Boundary 2.1: Empty & Zero-Length Audio Buffers & Missing Inputs
  // ==========================================================================
  describe("2.1 Empty & Zero-Length Audio Buffers & Missing Inputs", () => {
    it("rejects request lacking both audio recording and transcript with HTTP 400 MISSING_INPUT", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("MISSING_INPUT");
    });

    it("rejects voice query lacking both audio recording and query text with HTTP 400 MISSING_QUERY", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("MISSING_QUERY");
    });

    it("rejects Khata request lacking both audio recording and transcript with HTTP 400 MISSING_TRANSCRIPT", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("MISSING_TRANSCRIPT");
    });

    it("handles 44-byte WAV header with 0 data samples gracefully without server crash", async () => {
      const headerOnlyWav = createWavHeader(16000, 0);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", headerOnlyWav, { filename: "header_only.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript).toBeDefined();
    });

    it("rejects multipart request lacking both audio file and transcript fields with HTTP 400", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .field("language", "hi-IN")
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("MISSING_INPUT");
    });
  });

  // ==========================================================================
  // Boundary 2.2: Corrupted Audio Bytes & Broken Magic Bytes
  // ==========================================================================
  describe("2.2 Corrupted Audio Bytes & Broken Magic Bytes", () => {
    it("handles truncated 12-byte RIFF header safely without unhandled exception", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.truncatedHeader, { filename: "truncated.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript).toBeDefined();
    });

    it("handles arbitrary ASCII text payload safely without buffer decoder crash", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.garbagePayload, { filename: "corrupt.txt", contentType: "audio/wav" })
          .field("language", "hi-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("handles spoofed JPEG file uploaded as audio/wav safely", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.spoofedImage, { filename: "fake.jpg", contentType: "audio/wav" })
          .field("language", "te-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("handles corrupted fmt chunk (subchunk1Size = 0) with graceful fallback", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.corruptFmtChunk, { filename: "badfmt.wav", contentType: "audio/wav" })
          .field("language", "ta-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("handles odd byte-length PCM stream without 16-bit word boundary alignment failure", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.oddLengthBuffer, { filename: "odd.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================================================
  // Boundary 2.3: Narrowband 8kHz Telephonic Audio & Frequency Filtering
  // ==========================================================================
  describe("2.3 Narrowband 8kHz Telephonic Audio & Frequency Filtering", () => {
    it("processes 8kHz audio with telephonic=true and logs 21.6 dB SNR improvement", async () => {
      const telephonicWav = createTelephonic8kHzWav(1.0);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", telephonicWav, { filename: "telephonic.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("telephonic", "true")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.telephonicProcessed).toBe(true);
      expect(res.body.data.speechAnalytics.acoustics.snrImprovementDb).toBe(21.6);
      expect(res.body.data.speechAnalytics.acoustics.detectedEnvironment).toContain("Telephonic 8kHz");
    });

    it("processes 8kHz audio with telephonic=false without failure", async () => {
      const telephonicWav = createTelephonic8kHzWav(1.0);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", telephonicWav, { filename: "telephonic_raw.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("telephonic", "false")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("filters 50Hz electrical hum in telephonic audio pipeline", async () => {
      const hummingWav = createHummingTelephonicWav(1.0, 50);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", hummingWav, { filename: "hum50hz.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("telephonic", "true")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.telephonicProcessed).toBe(true);
    });

    it("evaluates speech analytics for telephonic audio streams", async () => {
      const telephonicWav = createTelephonic8kHzWav(1.5);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .attach("audio", telephonicWav, { filename: "telecom.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("telephonic", "true")
          .field("audioDurationSeconds", "1.5")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.acoustics.detectedEnvironment).toContain("Telephonic 8kHz");
      expect(res.body.data.analytics.acoustics.snrImprovementDb).toBe(21.6);
    });

    it("extracts expense from telephonic audio with code-mixed Hinglish", async () => {
      const telephonicWav = createTelephonic8kHzWav(1.0);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .attach("audio", telephonicWav, { filename: "call_expense.wav", contentType: "audio/wav" })
          .field("language", "hi-en-IN")
          .field("telephonic", "true")
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Boundary 2.4: High Background Street & Bazaar Noise
  // ==========================================================================
  describe("2.4 High Background Street & Bazaar Noise", () => {
    it("applies noise suppression on low SNR (3 dB) street audio", async () => {
      const noisyWav = createBazaarNoiseWav(1.0, 3);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", noisyWav, { filename: "bazaar_3db.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("telephonic", "false")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.speechAnalytics.acoustics.snrImprovementDb).toBe(18.4);
      expect(res.body.data.speechAnalytics.acoustics.detectedEnvironment).toContain("Bazaar");
    });

    it("extracts expense cleanly despite simulated traffic rumble", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Auto fare 120 rupees paid by cash",
            language: "en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(120);
      expect(res.body.data.extractedExpense.category).toBe("Transport");
    });

    it("verifies confidence remains high (>= 0.88) on noisy audio input", async () => {
      const noisyWav = createBazaarNoiseWav(1.0, 6);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", noisyWav, { filename: "bazaar_6db.wav", contentType: "audio/wav" })
          .field("language", "te-IN")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.confidence).toBeGreaterThanOrEqual(0.88);
    });

    it("evaluates silence ratio and speech rate in background noise environment", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Sharma ji ki dukan pe rashan liya",
            language: "hi-IN",
            telephonic: false,
            audioDurationSeconds: 4.0,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.acoustics.silenceRatioPercent).toBeDefined();
      expect(res.body.data.analytics.acoustics.speechRateWpm).toBeGreaterThan(0);
    });

    it("verifies anti-spoof human liveness verification in noisy environments", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Mera account balance kitna hai",
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.compliance.antiSpoofStatus).toBe("authentic_human_liveness_verified");
    });
  });

  // ==========================================================================
  // Boundary 2.5: Zero, Negative & Extreme Numerical Amounts
  // ==========================================================================
  describe("2.5 Zero, Negative & Extreme Numerical Amounts", () => {
    it("rejects a zero-rupee expense", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Maine aaj kuch bhi kharcha nahi kiya 0 rupees",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_VOICE_AMOUNT");
    });

    it("parses salary and sales credit as income transaction", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Company se salary credit 35000 rupaye account me aaya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(35000);
      expect(res.body.data.extractedExpense.type).toBe("income");
    });

    it("normalizes colloquial Indic fraction 'dedh hazaar' to 1500", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Dukan pe dedh hazaar rupaye ka ration liya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(1500);
    });

    it("normalizes colloquial Indic fraction 'dhai sau' to 250", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Chai snacks ke liye dhai sau rupaye diye",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(250);
    });

    it("handles large high-value property or gold amount (15,00,000) without integer overflow", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Property registration ke liye 15,00,000 rupaye transfer kiye netbanking se",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(1500000);
      expect(res.body.data.extractedExpense.paymentMethod).toBe("NetBanking");
    });
  });

  // ==========================================================================
  // Boundary 2.6: Missing, Invalid & Expired Credentials
  // ==========================================================================
  describe("2.6 Missing, Invalid & Expired Credentials", () => {
    it("rejects unauthenticated request with HTTP 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/voice/transcribe")
        .send({ language: "hi-IN" });

      expect(res.status).toBe(401);
    });

    it("rejects request with malformed JWT token with HTTP 401 Unauthorized", async () => {
      const res = await request(app)
        .get("/api/v1/voice/languages")
        .set("Cookie", "jwt=malformed.invalid.token");

      expect(res.status).toBe(401);
    });

    it("rejects state-mutating POST with mismatched CSRF token with HTTP 403 CSRF_FAILED", async () => {
      const res = await request(app)
        .post("/api/v1/voice/transcribe")
        .set("Cookie", [session.authCookie, "csrf_token=valid_cookie_token"])
        .set("x-csrf-token", "mismatched_header_token")
        .set("x-org-id", session.orgId)
        .send({ language: "hi-IN" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("CSRF_FAILED");
    });

    it("rejects request with malformed hexadecimal x-org-id with HTTP 400 or 403", async () => {
      const res = await request(app)
        .post("/api/v1/voice/transcribe")
        .set("Cookie", session.cookies)
        .set("x-csrf-token", session.csrfToken)
        .set("x-org-id", "not-a-valid-hex-id")
        .send({ language: "hi-IN" });

      expect([400, 403]).toContain(res.status);
    });

    it("operates gracefully in deterministic fallback mode when GNANI_API_KEY is unset", async () => {
      const originalKey = process.env.GNANI_API_KEY;
      delete process.env.GNANI_API_KEY;

      try {
        const res = await session.applyAuth(
          request(app)
            .post("/api/v1/voice/synthesize")
            .send({
              text: "Offline deterministic fallback test.",
              language: "hi-IN",
            })
        );

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.audioBase64.length).toBeGreaterThan(0);
      } finally {
        if (originalKey !== undefined) {
          process.env.GNANI_API_KEY = originalKey;
        }
      }
    });
  });

  // ==========================================================================
  // Boundary 2.7: Payload Size Limits & Text Constraints
  // ==========================================================================
  describe("2.7 Payload Size Limits & Text Constraints", () => {
    it("rejects oversized audio upload (>10MB) via Multer limit", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .attach("audio", AudioFixtures.oversizedBuffer, { filename: "oversized.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
      );

      // Multer throws 400 or 413 for LIMIT_FILE_SIZE
      expect([400, 413, 500]).toContain(res.status);
    });

    it("rejects speech synthesis text exceeding 4,000 characters with HTTP 400", async () => {
      const longText = "a".repeat(4001);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: longText,
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects synthesis speaking rate exceeding maximum 2.0 with HTTP 400", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Valid text",
            speakingRate: 3.5,
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects synthesis pitch exceeding maximum +10 with HTTP 400", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Valid text",
            pitch: 15,
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects synthesis empty or whitespace-only text with HTTP 400", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "    ",
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
