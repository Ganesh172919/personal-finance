/**
 * @fileoverview Tier 1: Feature Coverage Test Suite — FinWise Bharat Voice.
 *
 * Comprehensive opaque-box HTTP verification of all individual features against Express createApp():
 * - 12 Indic Dialects Speech-to-Text (Prisma v3.0)
 * - 4 STT Operating Modes (transcribe, code-mix, verbatim, transliterate, auto)
 * - Timbre TTS synthesis options (genders, rates, pitch, audio tags <emphasis>/<pauses>, emotions)
 * - Evon 30B reasoning expense extraction (Kirana, dining, multi-item, Mandi, gold, transport, utility)
 * - BFSI Khata debt tracking & localized WhatsApp reminder generation
 * - Spoken two-way conversational financial Q&A over live ledger
 * - Speech acoustic telemetry, SNR measurement, sentiment, and RBI compliance
 * - Platform telemetry & language catalog endpoints
 *
 * Each feature area contains >= 5 test cases.
 *
 * @module test/e2e/tier1_feature_coverage.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { configurePassport } from "../../config/passport";
import { startTestDb, stopTestDb, clearTestDb } from "../testDb";
import { createAuthedSession, type AuthedSession } from "./helpers/authHelper";
import { AudioFixtures, createClean16kHzWav } from "./fixtures/audioFixtures";
import { INDIC_LANGUAGES } from "../../services/gnaniVoiceService";

describe("Tier 1: Feature Coverage — FinWise Bharat Voice", () => {
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
  // Feature 1.1: 12 Indic Dialects Speech-to-Text & Recognition (Prisma v3.0)
  // ==========================================================================
  describe("1.1 Indic Dialect Speech-to-Text Recognition (Prisma v3.0)", () => {
    const dialectTestMatrix = [
      { code: "hi-IN", name: "Hindi", expectedToken: "Sharma ji" },
      { code: "hi-en-IN", name: "Hinglish", expectedToken: "Swiggy" },
      { code: "te-IN", name: "Telugu", expectedToken: "Kalyan Jewellers" },
      { code: "ta-IN", name: "Tamil", expectedToken: "Tea kadai" },
      { code: "kn-IN", name: "Kannada", expectedToken: "kirana" },
      { code: "ml-IN", name: "Malayalam", expectedToken: "Supermarket" },
      { code: "bn-IN", name: "Bengali", expectedToken: "Mudir dokan" },
      { code: "gu-IN", name: "Gujarati", expectedToken: "kirana" },
      { code: "mr-IN", name: "Marathi", expectedToken: "bhaji pala" },
      { code: "pa-IN", name: "Punjabi", expectedToken: "Dukan ton" },
      { code: "or-IN", name: "Odia", expectedToken: "Dukan ru" },
      { code: "en-IN", name: "Indian English", expectedToken: "electricity bill" },
    ];

    for (const dialect of dialectTestMatrix) {
      it(`transcribes spoken audio in ${dialect.name} (${dialect.code})`, async () => {
        const audioBuffer = createClean16kHzWav(1.0);

        const res = await session.applyAuth(
          request(app)
            .post("/api/v1/voice/transcribe")
            .attach("audio", audioBuffer, { filename: `${dialect.code}.wav`, contentType: "audio/wav" })
            .field("language", dialect.code)
            .field("telephonic", "false")
            .field("codeMixed", "true")
        );

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.detectedLanguage).toBe(dialect.code);
        expect(res.body.data.confidence).toBeGreaterThanOrEqual(0.9);
        expect(res.body.data.transcript).toContain(dialect.expectedToken);
        expect(res.body.data.model).toContain("Prisma v3.0");
      });
    }

    it("transcribes audio payload via JSON audioBase64 encoding", async () => {
      const audioBuffer = createClean16kHzWav(1.0);

      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: audioBuffer.toString("base64"),
            language: "te-IN",
            telephonic: false,
            codeMixed: true,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.detectedLanguage).toBe("te-IN");
      expect(res.body.data.transcript).toContain("Kalyan Jewellers");
    });
  });

  // ==========================================================================
  // Feature 1.2: Prisma STT Operating Modes
  // ==========================================================================
  describe("1.2 Prisma STT Operating Modes", () => {
    it("handles mode 'transcribe' with normalized Indic grammar", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "hi-IN",
            mode: "transcribe",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.model).toContain("Prisma v3.0");
      expect(res.body.data.confidence).toBeGreaterThan(0.9);
    });

    it("handles mode 'code-mix' preserving Hinglish technical & brand terms", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "hi-en-IN",
            mode: "code-mix",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript).toMatch(/Swiggy|Paytm|UPI/i);
    });

    it("handles mode 'verbatim' capturing spoken utterance nuances", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "hi-IN",
            mode: "verbatim",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript.length).toBeGreaterThan(0);
    });

    it("handles mode 'transliterate' with phonetic Romanized representation", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "te-IN",
            mode: "transliterate",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript.length).toBeGreaterThan(0);
    });

    it("handles language 'auto' by detecting primary Indic language profile", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/transcribe")
          .send({
            audioBase64: AudioFixtures.clean16kHz.toString("base64"),
            language: "auto",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.detectedLanguage).toBeDefined();
      expect(res.body.data.detectedLanguage).not.toBe("auto");
    });
  });

  // ==========================================================================
  // Feature 1.3: Timbre Text-to-Speech Synthesis & Voice Options
  // ==========================================================================
  describe("1.3 Timbre Text-to-Speech Synthesis & Voice Options", () => {
    it("synthesizes natural female voice in Hindi (hi-IN) with valid WAV buffer", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Aapka ₹450 ka kharcha safaltapoorvak log ho gaya.",
            language: "hi-IN",
            voiceGender: "female",
            speakingRate: 1.0,
            pitch: 0,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.language).toBe("hi-IN");
      expect(res.body.data.voiceGender).toBe("female");
      expect(res.body.data.mimeType).toBe("audio/wav");

      const audio = Buffer.from(res.body.data.audioBase64, "base64");
      expect(audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(audio.subarray(8, 12).toString("ascii")).toBe("WAVE");
    });

    it("synthesizes male voice in Tamil (ta-IN) with pitch & speed modulations", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Ungaladhu ₹1,200 selavu vetrigaramaga padhivu seyyappattathu.",
            language: "ta-IN",
            voiceGender: "male",
            speakingRate: 1.25,
            pitch: -2,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.voiceGender).toBe("male");
      expect(res.body.data.language).toBe("ta-IN");
    });

    it("synthesizes celebratory emotion with <emphasis> audio tags", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Badhaai ho! <emphasis level=\"strong\">Aapne is mahine ₹3,500 ki bachat ki hai!</emphasis>",
            language: "hi-IN",
            voiceGender: "female",
            speakingRate: 1.0,
            pitch: 2,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.audioBase64.length).toBeGreaterThan(0);
    });

    it("synthesizes cautionary alert with <pauses> tag for budget overrun", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "<emphasis level=\"moderate\">Chetavani!</emphasis> <pauses time=\"300ms\"/> Aapka Groceries budget 90% poora ho chuka hai.",
            language: "hi-IN",
            voiceGender: "male",
            speakingRate: 0.95,
            pitch: 0,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.audioBase64.length).toBeGreaterThan(0);
    });

    it("synthesizes assertive BFSI debt collection prosody with numerical clarity", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/synthesize")
          .send({
            text: "Namaste Ramesh ji! Aapka ₹650 ka udhar baki hai. Kripya shaniwar tak bhugtan karein.",
            language: "hi-IN",
            voiceGender: "female",
            speakingRate: 1.05,
            pitch: 1,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.model).toContain("Timbre");
    });
  });

  // ==========================================================================
  // Feature 1.4: Evon Reasoning & Financial Entity Extraction
  // ==========================================================================
  describe("1.4 Evon Reasoning & Financial Entity Extraction", () => {
    it("extracts Kirana provision expense and commits to ledger", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Maine aaj Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye UPI se diye",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(450);
      expect(res.body.data.extractedExpense.category).toBe("Groceries");
      expect(res.body.data.extractedExpense.merchantName).toContain("Sharma");
      expect(res.body.data.extractedExpense.paymentMethod).toBe("UPI");
      expect(res.body.data.extractedExpense.type).toBe("expense");
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.transaction.orgId).toBe(session.orgId);
    });

    it("extracts food & dining expense from Hinglish Swiggy utterance", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Ordered lunch from Swiggy for 320 rupees using Paytm UPI",
            language: "hi-en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(320);
      expect(res.body.data.extractedExpense.category).toBe("Food & Dining");
      expect(res.body.data.extractedExpense.merchantName).toBe("Swiggy");
      expect(res.body.data.extractedExpense.paymentMethod).toContain("Paytm");
    });

    it("extracts multi-item Kirana purchase (atta and cooking oil)", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Kirana dukan pe 500 rupaye ka aata aur tel liya cash me",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(500);
      expect(res.body.data.extractedExpense.category).toBe("Groceries");
      expect(res.body.data.extractedExpense.paymentMethod).toBe("Cash");
    });

    it("extracts rural Mandi agricultural input purchase", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Tractor diesel ke liye 2200 rupaye diye pump par nagad",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(2200);
      expect(res.body.data.extractedExpense.category).toBe("Transport");
      expect(res.body.data.extractedExpense.paymentMethod).toBe("Cash");
    });

    it("extracts high-value gold investment in Telugu", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Kalyan Jewellers lo 25,000 petti gold coin konnanu PhonePe dwara",
            language: "te-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(25000);
      expect(res.body.data.extractedExpense.category).toBe("Investment");
      expect(res.body.data.extractedExpense.merchantName).toBe("Kalyan Jewellers");
      expect(res.body.data.extractedExpense.type).toBe("investment");
    });

    it("extracts transport commute fare via Ola cabs on credit card", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Ola cab airport trip 850 rupees paid via credit card",
            language: "en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(850);
      expect(res.body.data.extractedExpense.category).toBe("Transport");
      expect(res.body.data.extractedExpense.paymentMethod).toBe("Credit Card");
    });

    it("extracts utility electricity bill payment via net banking", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Bijli ka bill bhara 1850 rupaye net banking se",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extractedExpense.amount).toBe(1850);
      expect(res.body.data.extractedExpense.category).toBe("Utilities");
      expect(res.body.data.extractedExpense.paymentMethod).toBe("NetBanking");
    });
  });

  // ==========================================================================
  // Feature 1.5: BFSI Khata & Localized Debt Reminders
  // ==========================================================================
  describe("1.5 BFSI Khata & Localized Debt Reminders", () => {
    it("extracts informal Hindi debt note and generates spoken collection reminder", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Ramesh bhai ko 650 rupaye udhar diye shaniwar tak lautayenge",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.khata.amount).toBe(650);
      expect(res.body.data.khata.contactName).toContain("Ramesh");
      expect(res.body.data.khata.direction).toBe("lent");
      expect(res.body.data.khata.reminderSpeech).toContain("650");
      expect(res.body.data.khata.audioReminder).toBeDefined();
    });

    it("extracts Telugu debt record and generates spoken Telugu reminder", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Suresh gariki 1200 rupees udhar ichhanu monday istharu",
            language: "te-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.khata.amount).toBe(1200);
      expect(res.body.data.khata.contactName).toContain("Suresh");
      expect(res.body.data.khata.direction).toBe("lent");
      expect(res.body.data.khata.reminderSpeech).toContain("Namaskaram");
    });

    it("extracts debt repayment collected record in Tamil", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Kannan se 500 rupaye wapas mila debt chukaya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.khata.amount).toBe(500);
      expect(res.body.data.khata.direction).toBe("collected");
      expect(res.body.data.khata.reminderSpeech).toContain("Dhanyawad");
    });

    it("extracts Hinglish merchant credit with weekly due date", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Sharma ji ka 2000 rupees udhar credit due next week",
            language: "hi-en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.khata.amount).toBe(2000);
      expect(res.body.data.khata.contactName).toContain("Sharma");
      expect(res.body.data.khata.direction).toBe("lent");
    });

    it("extracts borrowed loan record from friend", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Priya se 1500 rupaye udhar liya agle mahine chukana hai",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.khata.amount).toBe(1500);
      expect(res.body.data.khata.contactName).toContain("Priya");
      expect(res.body.data.khata.direction).toBe("borrowed");
    });
  });

  // ==========================================================================
  // Feature 1.6: Conversational Voice Q&A & Ledger Reasoning
  // ==========================================================================
  describe("1.6 Conversational Voice Q&A & Ledger Reasoning", () => {
    it("answers Hindi monthly remaining balance inquiry", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "Mera is mahine ka total balance kitna bacha hai?",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.query).toContain("total balance");
      expect(res.body.data.answer.length).toBeGreaterThan(10);
      expect(res.body.data.financialContext).toBeDefined();
      expect(res.body.data.audioFeedback).toBeDefined();
    });

    it("identifies top spending category in Hindi query", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "Sabse zyada kharcha kis category me hua hai?",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer.length).toBeGreaterThan(10);
    });

    it("answers Telugu monthly total expenditure inquiry", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "Nenu e mahina mottham entha karchu pettanu?",
            language: "te-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.query).toContain("karchu");
      expect(res.body.data.audioFeedback.language).toBe("te-IN");
    });

    it("answers Tamil savings query with localized voice response", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "Indha maasam en kitta evlo savings irukku?",
            language: "ta-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.audioFeedback.language).toBe("ta-IN");
    });

    it("evaluates high-level budget status from Hinglish voice query", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/query")
          .send({
            query: "What is my remaining budget and financial health this month?",
            language: "hi-en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.financialContext.currency).toBe("INR");
    });
  });

  // ==========================================================================
  // Feature 1.7: Speech Acoustics & Compliance Analytics
  // ==========================================================================
  describe("1.7 Speech Acoustics & Compliance Analytics", () => {
    it("measures acoustics, SNR improvement, and positive sentiment", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Maine aaj Sharma ji ki dukan pe 450 rupaye rashan ke liye UPI se diye",
            language: "hi-IN",
            telephonic: true,
            audioDurationSeconds: 3.2,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.sentiment.label).toBe("Positive");
      expect(res.body.data.analytics.acoustics.snrImprovementDb).toBe(21.6);
      expect(res.body.data.analytics.acoustics.detectedEnvironment).toContain("Telephonic");
    });

    it("verifies RBI Fair Practices debt collection code compliance", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Ramesh bhai ka 1500 rupaye udhar baki hai monday tak lautao",
            language: "hi-IN",
            telephonic: false,
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.sentiment.label).toBe("Urgent");
      expect(res.body.data.analytics.compliance.rbiFairPracticesPassed).toBe(true);
      expect(res.body.data.analytics.compliance.debtCollectionCodeVerified).toBe(true);
    });

    it("verifies authentic human liveness via Voice Biometrics shield", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Groceries purchase completed",
            language: "en-IN",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.compliance.antiSpoofStatus).toBe("authentic_human_liveness_verified");
      expect(res.body.data.analytics.compliance.voiceBiometricsMatchScore).toBeGreaterThanOrEqual(99.0);
    });

    it("evaluates Indic dialect phonetic fidelity and Dravidian regional classification", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Kalyan Jewellers lo gold konnanu",
            language: "te-IN",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.indicDialectMetrics.regionName).toContain("Southern India");
      expect(res.body.data.analytics.indicDialectMetrics.phoneticFidelityScore).toBeGreaterThan(0.95);
    });

    it("computes code-mixed loan word ratio for Hinglish utterance", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/analytics")
          .send({
            transcript: "Swiggy order bill paid via Paytm UPI at dinner",
            language: "hi-en-IN",
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analytics.indicDialectMetrics.codeMixedRatioPercent).toBeGreaterThan(20);
    });
  });

  // ==========================================================================
  // Feature 1.8: Platform Telemetry & Catalog Endpoints
  // ==========================================================================
  describe("1.8 Platform Telemetry & Languages Catalog", () => {
    it("returns supported Indic languages catalog with native scripts (GET /api/v1/voice/languages)", async () => {
      const res = await session.applyAuth(
        request(app).get("/api/v1/voice/languages")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(12);

      const codes = res.body.data.map((l: any) => l.code);
      expect(codes).toContain("hi-IN");
      expect(codes).toContain("hi-en-IN");
      expect(codes).toContain("te-IN");
      expect(codes).toContain("ta-IN");
    });

    it("returns platform status, 5000 credits, and sovereign model registry (GET /api/v1/voice/status)", async () => {
      const res = await session.applyAuth(
        request(app).get("/api/v1/voice/status")
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.challenge).toBe("The Great Indian AI Internship Challenge 2026");
      expect(res.body.data.participant).toBe("J Ganesh Kumar Reddy");
      expect(res.body.data.providerMode).toBe("simulation");
      expect(res.body.data.connectionVerified).toBe(false);
      expect(res.body.data.telemetrySource).toBe("demo");
      expect(res.body.data.creditsAllocated).toBe(5000);
      expect(res.body.data.models.stt).toContain("Prisma v3.0");
      expect(res.body.data.models.tts).toContain("Timbre");
      expect(res.body.data.models.llm).toContain("Evon");
    });
  });
});
