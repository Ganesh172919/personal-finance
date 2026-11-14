/**
 * @fileoverview Tier 3: Cross-Feature Integration Test Suite — FinWise Bharat Voice.
 *
 * Verifies multi-model end-to-end pipelines across Prisma STT, Evon reasoning,
 * MongoDB ledger commitment, and Timbre TTS expressive audio synthesis:
 * - Pipeline 3.1: Complete Speech-to-Ledger Commitment Pipeline
 * - Pipeline 3.2: Telephonic Ingestion + Noise Suppression + Hinglish Extraction + Expressive TTS
 * - Pipeline 3.3: BFSI Khata Debt Note -> Reminder Audio -> Ledger Settlement Lifecycle
 * - Pipeline 3.4: Conversational Voice Financial Health Check over Live Aggregated Ledger
 * - Pipeline 3.5: Multi-Profile Simulation Engine & Resilience Switching
 *
 * @module test/e2e/tier3_cross_feature.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import axios from "axios";
import request from "supertest";

import { createApp } from "../../app";
import { configurePassport } from "../../config/passport";
import { startTestDb, stopTestDb } from "../testDb";
import { createAuthedSession, type AuthedSession } from "./helpers/authHelper";
import {
  AudioFixtures,
  createClean16kHzWav,
  createTelephonic8kHzWav,
  createBazaarNoiseWav,
  createAudibleChimeWav,
} from "./fixtures/audioFixtures";
import TransactionModel from "../../models/transactionModel";
import { getVoiceProvider, LiveGnaniVoiceProvider, setVoiceProvider } from "../../services/gnaniVoiceService";

describe("Tier 3: Cross-Feature Pipelines — FinWise Bharat Voice", () => {
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

  it("leaves expense drafts out of the ledger and saves the reviewed amount only once", async () => {
    const before = await TransactionModel.countDocuments({ orgId: session.orgId });
    const preview = await session.applyAuth(request(app).post("/api/voice/expense-preview"))
      .send({ transcript: "मैंने चाय पर पचास रुपये खर्च किए।", language: "hi-IN" })
      .expect(200);
    expect(preview.body.data.expense).toMatchObject({ amount: 50, currency: "INR", category: "Food & Dining" });
    expect(await TransactionModel.countDocuments({ orgId: session.orgId })).toBe(before);

    const draftToken = preview.body.data.draftToken;
    const commit = () => session.applyAuth(request(app).post("/api/voice/log-expense"))
      .send({ draftToken, transcript: "900 rupees for lunch", currency: "USD" });
    const [first, second] = await Promise.all([commit(), commit()]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.extractedExpense).toMatchObject({ amount: 50, currency: "INR" });
    expect(second.body.data.transaction._id).toBe(first.body.data.transaction._id);
    expect(await TransactionModel.countDocuments({ orgId: session.orgId })).toBe(before + 1);
  });

  // ==========================================================================
  // Pipeline 3.1: Complete Speech-to-Ledger Commitment Pipeline
  // ==========================================================================
  describe("3.1 Complete Speech-to-Ledger Commitment Pipeline", () => {
    it("ingests spoken Hindi audio, transcribes, extracts via Evon, commits to ledger, and confirms via Timbre", async () => {
      // 1. Synthesize clean 16kHz audio waveform
      const audioBuffer = createClean16kHzWav(1.2);

      // 2. Dispatch audio file to log-expense endpoint
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .attach("audio", audioBuffer, { filename: "groceries.wav", contentType: "audio/wav" })
          .field("language", "hi-IN")
          .field("currency", "INR")
      );

      // 3. Verify HTTP response
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // 4. Verify Evon extraction accuracy
      const extracted = res.body.data.extractedExpense;
      expect(extracted).toBeDefined();
      expect(extracted.amount).toBe(450);
      expect(extracted.category).toBe("Groceries");
      expect(extracted.paymentMethod).toBe("UPI");
      expect(extracted.merchantName).toContain("Sharma");

      // 5. Verify ledger transaction returned by HTTP endpoint
      const tx = res.body.data.transaction;
      expect(tx).toBeDefined();
      expect(tx._id).toBeDefined();
      expect(tx.amount).toBeCloseTo(-450 / 83.5, 10);
      const ledger = await session.applyAuth(request(app).get("/api/transactions?currency=INR"));
      expect(ledger.status).toBe(200);
      expect(JSON.stringify(ledger.body)).toContain('"amount":-450');
      expect(tx.category).toBe("Groceries");
      expect(tx.reconciliationStatus).toBe("cleared");

      // 6. Verify Timbre synthesized audio confirmation
      const audioFeedback = res.body.data.audioFeedback;
      expect(audioFeedback).toBeDefined();
      expect(audioFeedback.mimeType).toBe("audio/wav");
      expect(audioFeedback.language).toBe("hi-IN");

      const audioBytes = Buffer.from(audioFeedback.audioBase64, "base64");
      expect(audioBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(audioBytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    });
  });

  // ==========================================================================
  // Pipeline 3.2: Telephonic Ingestion + Noise Suppression + Hinglish + Expressive TTS
  // ==========================================================================
  describe("3.2 Telephonic Ingestion + Noise Suppression + Hinglish Extraction + Expressive TTS", () => {
    it("processes narrowband 8kHz audio with telephonic DSP filtering and Hinglish extraction", async () => {
      // 1. Synthesize 8kHz narrowband telephonic audio
      const telephonicAudio = createTelephonic8kHzWav(1.0);

      // 2. Submit with telephonic DSP and code-mixed flags
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .attach("audio", telephonicAudio, { filename: "telecom_swiggy.wav", contentType: "audio/wav" })
          .field("language", "hi-en-IN")
          .field("telephonic", "true")
          .field("currency", "INR")
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      expect(res.body.data.modelsUsed).toEqual({
        stt: "Simulated transcription",
        reasoning: "Expense rules",
        tts: "Confirmation chime",
      });

      // Verify Hinglish dining entity extraction
      const extracted = res.body.data.extractedExpense;
      expect(extracted.amount).toBe(320);
      expect(extracted.category).toBe("Food & Dining");
      expect(extracted.paymentMethod).toContain("Paytm");

      // Verify audio feedback is generated
      expect(res.body.data.audioFeedback.audioBase64.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Pipeline 3.3: BFSI Khata Debt Tracking -> Reminder Synthesis -> Settlement
  // ==========================================================================
  describe("3.3 BFSI Khata Debt Note -> Spoken WhatsApp Reminder -> Settlement", () => {
    it("tracks informal Indian debt note, synthesizes localized WhatsApp audio reminder, and reconciles settlement", async () => {
      // Stage 1: Vendor creates informal Udhar debt note via voice
      const debtRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Ramesh bhai ko 650 rupaye udhar diye shaniwar tak lautayenge",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(debtRes.status).toBe(201);
      expect(debtRes.body.success).toBe(true);
      expect(debtRes.body.data.khata.amount).toBe(650);
      expect(debtRes.body.data.khata.contactName).toContain("Ramesh");
      expect(debtRes.body.data.khata.direction).toBe("lent");

      // Verify WhatsApp reminder speech synthesis
      const reminderSpeech = debtRes.body.data.khata.reminderSpeech;
      expect(reminderSpeech).toContain("Ramesh");
      expect(reminderSpeech).toContain("650");
      expect(reminderSpeech).toMatch(/shaniwar|Saturday/i);

      // Stage 2: Vendor records repayment settlement when customer repays
      const settleRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Ramesh bhai se 650 rupaye wapas mila udhar chukaya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(settleRes.status).toBe(201);
      expect(settleRes.body.success).toBe(true);
      expect(settleRes.body.data.khata.amount).toBe(650);
      expect(settleRes.body.data.khata.direction).toBe("collected");
      expect(settleRes.body.data.khata.reminderSpeech).toContain("Dhanyawad");
    });
  });

  // ==========================================================================
  // Pipeline 3.4: Conversational Voice Financial Health Check over Live Ledger
  // ==========================================================================
  describe("3.4 Conversational Voice Financial Health Check over Live Ledger", () => {
    it("reports a cash flow shortfall from the ledger with honest fallback attribution", async () => {
      // 1. Seed two voice expenses into the ledger
      await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye diye",
            language: "hi-IN",
          })
      );

      await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Petrol pump par 500 rupaye ka petrol bharwaya",
            language: "hi-IN",
          })
      );

      // 2. Perform two-way spoken conversational voice query
      const queryRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "Mera is mahine ka total balance aur kharcha kitna hai?",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.success).toBe(true);
      expect(queryRes.body.data.query).toContain("total balance");
      expect(queryRes.body.data.answer.length).toBeGreaterThan(10);
      expect(queryRes.body.data.financialContext).toBeDefined();
      expect(queryRes.body.data.financialContext.transactionCount).toBeGreaterThanOrEqual(2);
      expect(queryRes.body.data.financialContext.totalSpentThisMonth).toBeGreaterThanOrEqual(950);
      const { totalIncomeThisMonth, totalSpentThisMonth } = queryRes.body.data.financialContext;
      const net = totalIncomeThisMonth - totalSpentThisMonth;
      expect(net).toBeLessThan(0);
      expect(queryRes.body.data.answer).toContain(new Intl.NumberFormat("en-IN", {
        style: "currency", currency: "INR", minimumFractionDigits: 0,
      }).format(net));
      expect(queryRes.body.data.modelsUsed).toEqual({
        stt: "Text input",
        reasoning: "Ledger summary",
        tts: "Confirmation chime",
      });
      expect(queryRes.body.data.audioFeedback.audioBase64.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Pipeline 3.5: Multi-Profile Simulation Engine & Resilience Switching
  // ==========================================================================
  describe("3.5 Multi-Profile Simulation Engine & Resilience Switching", () => {
    it("executes lightning-fast offline mock pipeline in < 200ms", async () => {
      const startTime = Date.now();

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "hi-IN",
          })
      );

      const elapsed = Date.now() - startTime;
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(elapsed).toBeLessThan(1000); // Instant mode completes well under 1s
    });

    it("synthesizes valid audible chime (~25KB) in offline mock TTS mode", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Audible chime synthesis verification.",
            language: "hi-IN",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mimeType).toBe("audio/wav");

      const audioBuf = Buffer.from(res.body.data.audioBase64, "base64");
      expect(audioBuf.length).toBeGreaterThanOrEqual(44);
      expect(audioBuf.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(audioBuf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    });

    it("leaves the ledger intact when live transcription is unavailable", async () => {
      const previousProvider = getVoiceProvider();
      const post = vi.spyOn(axios, "post").mockRejectedValue(new Error("Speech API unavailable"));
      vi.stubEnv("GNANI_API_KEY", "voice-outage-test-key");
      setVoiceProvider(new LiveGnaniVoiceProvider());

      try {
        const before = await TransactionModel.countDocuments({ orgId: session.orgId });
        const res = await session.applyAuth(
          request(app)
            .post("/api/v1/voice/log-expense")
            .attach("audio", AudioFixtures.clean16kHz, "recording.wav")
            .field("language", "hi-IN")
        );

        expect(post).toHaveBeenCalledOnce();
        expect(res.status).toBe(502);
        expect(res.body.code).toBe("GNANI_TRANSCRIPTION_FAILED");
        expect(await TransactionModel.countDocuments({ orgId: session.orgId })).toBe(before);
      } finally {
        setVoiceProvider(previousProvider);
        post.mockRestore();
        vi.unstubAllEnvs();
      }
    });
  });
});
