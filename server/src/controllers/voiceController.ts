/**
 * @fileoverview Controller handlers for Gnani AI Voice & Indic Speech endpoints.
 *
 * Implements:
 * - POST /voice/transcribe
 * - POST /voice/synthesize
 * - POST /voice/log-expense
 * - GET  /voice/languages
 * - GET  /voice/status
 *
 * @module controllers/voiceController
 */

import type { Request, Response } from "express";
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import type { IUserDocument } from "../models/userModel";
import { transcribeBodySchema } from "../schemas/voiceSchemas";
import { normalizeCurrency } from "../utils/currencyFx";
import { invalidateBudgetEnvelopes } from "../services/financeIntelligence";
import { processAiCoreRequest } from "../services/aiCoreClient";
import { recordFeatureUsage, reserveFeatureUsage } from "../services/entitlements";
import {
  transcribeAudioPrisma,
  synthesizeSpeechTimbre,
  extractExpenseFromVoiceTranscript,
  logExpenseFromVoice,
  answerFinanceVoiceQuery,
  extractKhataDebtFromVoice,
  qualifyLeadFromVoice,
  resolveDisputeFromVoice,
  generateAgentAssistInsights,
  adviseTaxFromVoice,
  generateBillingInvoiceFromVoice,
  evaluateGovernmentSchemesFromVoice,
  verifyVoiceBiometricsLiveness,
  auditBpoContactCenterCallFromVoice,
  healthcareClinicalIntakeVoice,
  automotiveInCabinVoice,
  realEstateHousingCopilotVoice,
  hospitalityConciergeVoice,
  consumerDurablesSupportVoice,
  analyzeSpeechAcoustics,
  getGnaniPlatformStatus,
  type ExtractedVoiceExpense,
  type TranscriptionResult,
  INDIC_LANGUAGES,
} from "../services/gnaniVoiceService";

function extractUserAndOrg(req: Request) {
  const user = req.user as IUserDocument | undefined;
  const orgId = String(req.org?.orgId || (user as any)?.currentOrgId || "demo-org-gnani").trim();
  const userId = user?._id?.toString() || "guest-evaluator-2026";

  return { user, orgId, userId };
}

function requireLiveLedgerTranscript(transcription: TranscriptionResult) {
  if (transcription.provider !== "gnani_prisma_v3_live" && process.env.NODE_ENV !== "test") {
    throw new HttpError(503, "VOICE_TRANSCRIPTION_UNAVAILABLE", "Live voice transcription is unavailable. Enter the transcript to save it.");
  }
  return transcription.transcript;
}

const expenseDraftAudience = "finwise-voice-expense-draft";
const expenseDraftSecret = () => createHmac("sha256", getEnv().JWT_SECRET).update(expenseDraftAudience).digest();

export async function previewVoiceExpenseHandler(req: Request, res: Response) {
  const { orgId, userId } = extractUserAndOrg(req);
  const { transcript, language } = req.body as { transcript: string; language: string };
  const expense = await extractExpenseFromVoiceTranscript(transcript, "INR");
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
    throw new HttpError(422, "INVALID_VOICE_AMOUNT", "Include a positive amount in the note, such as ₹50.");
  }

  const draftToken = jwt.sign({ orgId, expense, language }, expenseDraftSecret(), {
    algorithm: "HS256",
    audience: expenseDraftAudience,
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: "30m",
  });
  return res.json({ success: true, data: { expense, draftToken } });
}

function readVoiceExpenseDraft(token: string, orgId: string, userId: string) {
  try {
    const draft = jwt.verify(token, expenseDraftSecret(), {
      algorithms: ["HS256"], audience: expenseDraftAudience, subject: userId,
    }) as { orgId: string; expense: ExtractedVoiceExpense; language: string; jti: string };
    if (draft.orgId === orgId && draft.jti && draft.expense) return draft;
  } catch {
    // Expired and invalid drafts use the same recovery path.
  }
  throw new HttpError(422, "VOICE_DRAFT_INVALID", "Review the expense again to create a fresh draft.");
}

/**
 * Handles audio transcription via Gnani Prisma v3.0 STT.
 */
export async function transcribeVoiceHandler(req: Request, res: Response) {
  const startedAt = performance.now();
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  const audioBuffer = file ? file.buffer : undefined;
  const audioBase64 = body.audioBase64;
  const mimeType = file ? file.mimetype : body.mimeType || "audio/webm";
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const codeMixed = body.codeMixed !== false && body.codeMixed !== "false";

  const result = await transcribeAudioPrisma({
    audioBuffer,
    audioBase64,
    mimeType,
    language,
    telephonic,
    codeMixed,
    mode: transcribeBodySchema.shape.mode.parse(body.mode),
  });

  req.log?.info({
    event: "voice.transcribed",
    provider: result.provider,
    language: result.detectedLanguage,
    telephonic,
    durationMs: Math.round(performance.now() - startedAt),
  }, "Voice transcription completed");

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Handles text-to-speech synthesis via Gnani Timbre TTS.
 */
export async function synthesizeVoiceHandler(req: Request, res: Response) {
  const startedAt = performance.now();
  extractUserAndOrg(req);

  const { text, language, voiceGender, speakingRate, pitch } = req.body;

  if (!text || typeof text !== "string") {
    throw new HttpError(400, "INVALID_TEXT", "Text is required for speech synthesis");
  }

  const synthesis = new AbortController();
  const onDisconnect = () => { if (!res.writableEnded) synthesis.abort(); };
  res.once("close", onDisconnect);
  try {
    const result = await synthesizeSpeechTimbre({
      text, language, voiceGender, speakingRate, pitch, signal: synthesis.signal,
    });
    if (!synthesis.signal.aborted) {
      req.log?.info({
        event: "voice.synthesized",
        provider: result.provider,
        language: result.language,
        durationMs: Math.round(performance.now() - startedAt),
      }, "Voice synthesis completed");
      return res.json({ success: true, data: result });
    }
  } catch (error) {
    if (!synthesis.signal.aborted) throw error;
  } finally {
    res.off("close", onDisconnect);
  }
}

/**
 * Transcribes, extracts transaction via Evon 30B reasoning,
 * commits to ledger, and generates a Timbre TTS spoken response.
 */
export async function logExpenseVoiceHandler(req: Request, res: Response) {
  const { orgId, userId } = extractUserAndOrg(req);
  const file = (req as any).file;
  const body = req.body || {};

  const draft = body.draftToken === undefined ? undefined : readVoiceExpenseDraft(body.draftToken, orgId, userId);
  let transcript = body.transcript;
  let transcriptionModel = "Reviewed transcript";
  const language = draft?.language ?? (body.language || "auto");
  const telephonic = body.telephonic === true || body.telephonic === "true";

  // If audio is provided but no transcript, transcribe first
  if (!draft && !transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
      mode: "transcribe",
    });
    transcript = requireLiveLedgerTranscript(transcription);
    transcriptionModel = transcription.provider === "gnani_prisma_v3_live" ? transcription.model : "Simulated transcription";
  }

  if (!draft && (!transcript || typeof transcript !== "string")) {
    throw new HttpError(400, "MISSING_INPUT", "Either a voice audio recording or transcript string is required");
  }

  // 1. Extract transaction parameters using Gnani Evon 30B reasoning
  const extracted = draft?.expense ?? await extractExpenseFromVoiceTranscript(transcript, body.currency || "INR");

  // Generate audio before committing so synthesis failures leave the ledger intact.
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: normalizeCurrency(extracted.currency), minimumFractionDigits: 0,
  }).format(extracted.amount);
  const spokenConfirmationText =
    language === "te-IN"
      ? `Mee ${formattedAmount} selavu ${extracted.category} category lo safalamga record cheyabadindi.`
      : language === "ta-IN"
      ? `Ungalathu ${formattedAmount} selavu ${extracted.category} category lo safaltapoorvak log ho gaya hai.`
      : `Aapka ${formattedAmount} ka kharcha ${extracted.category} category me safaltapoorvak log ho gaya hai.`;

  const audioConfirmation = await synthesizeSpeechTimbre({
    text: spokenConfirmationText,
    language: language !== "auto" ? language : "hi-IN",
    voiceGender: "female",
  });
  const transaction = await logExpenseFromVoice({
    orgId,
    userId,
    expense: extracted,
    accountId: draft ? undefined : body.accountId,
    draftId: draft?.jti,
  });
  await invalidateBudgetEnvelopes(orgId, transaction.date);

  return res.status(201).json({
    success: true,
    data: {
      transaction,
      extractedExpense: extracted,
      spokenConfirmation: spokenConfirmationText,
      audioFeedback: audioConfirmation,
      modelsUsed: {
        stt: transcriptionModel,
        reasoning: extracted.reasoningProvider === "gnani_evon" ? "Gnani Evon" : "Expense rules",
        tts: audioConfirmation.provider === "gnani_timbre_live" ? audioConfirmation.model : "Confirmation chime",
      },
    },
  });
}

/**
 * Handles spoken two-way financial conversational queries.
 * Transcribes via Prisma, answers from the ledger or AI Core, and reads via Timbre.
 */
export async function queryVoiceHandler(req: Request, res: Response) {
  const startedAt = performance.now();
  const { orgId, userId, user } = extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let query = body.query;
  let transcriptionModel = "Text input";
  let language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  // Transcribe audio if provided
  if (!query && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    if (transcription.provider !== "gnani_prisma_v3_live") {
      throw new HttpError(503, "VOICE_TRANSCRIPTION_UNAVAILABLE", "Live transcription is unavailable. Try again or enter your question as text.");
    }
    if (language === "auto") language = transcription.detectedLanguage;
    query = transcription.transcript;
    transcriptionModel = transcription.model;
  }

  if (typeof query !== "string" || !query.trim() || query.length > 4000) {
    throw new HttpError(400, "MISSING_QUERY", "Spoken voice query or query text is required");
  }

  const inputLanguage = INDIC_LANGUAGES.find(item => item.code === language);
  const result = await answerFinanceVoiceQuery({
    orgId,
    userId,
    query,
    language: language !== "auto" ? language : "hi-IN",
    currency: body.currency || "INR",
    generateAnswer: user && req.org?.orgId ? async () => {
      const usageScope = { orgId: new Types.ObjectId(orgId), userId: user._id };
      const requestId = req.requestId;
      const feature = "monthly_ai_calls";
      const reservation = await reserveFeatureUsage({ ...usageScope, feature, requestId });
      const reasoningStartedAt = performance.now();
      try {
        const response = await processAiCoreRequest({
          user_input: `${query.trim()}\n\nReply briefly in ${inputLanguage?.name ?? "Hindi"} in plain text for spoken playback.`,
          user_profile: null,
          org_id: orgId,
          user_id: userId,
          options: { include_actions: false, include_evidence: false, include_confidence: false },
        }, requestId, { userId });
        const text = response.final_output?.trim();
        const usable = response.success && !response.fallback_used && response.analysis_type === "financial_education" && Boolean(text);
        req.log?.info({
          event: "voice.reasoning.completed",
          analysisType: response.analysis_type,
          provider: response.active_provider,
          model: response.active_model,
          llmCalls: response.llm_call_count,
          usable,
          durationMs: Math.round(performance.now() - reasoningStartedAt),
        }, "Voice reasoning completed");
        if (usable && text) {
          if (response.llm_call_count > 0) {
            await recordFeatureUsage({ ...usageScope, feature, requestId, units: 1, reservation,
              tokensIn: response.usage?.tokens_in, tokensOut: response.usage?.tokens_out,
              costUsd: response.usage?.cost_usd, modelName: response.active_model });
          }
          return { text, source: response.active_model || "Finance calculator" };
        }
      } finally {
        await reservation.release();
      }
    } : undefined,
  });

  req.log?.info({
    event: "voice.query.completed",
    input: transcriptionModel === "Text input" ? "text" : "audio",
    language: result.audioFeedback.language,
    answerSource: result.model,
    speechProvider: result.audioFeedback.provider,
    durationMs: Math.round(performance.now() - startedAt),
  }, "Voice question answered");

  return res.json({
    success: true,
    data: {
      query: result.query,
      answer: result.answerText,
      audioFeedback: result.audioFeedback,
      financialContext: result.financialContext,
      modelsUsed: {
        stt: transcriptionModel,
        reasoning: result.model,
        tts: result.audioFeedback.provider === "gnani_timbre_live" ? result.audioFeedback.model : "Confirmation chime",
      },
    },
  });
}

/**
 * Handles spoken BFSI Collections & Khata debt tracking.
 * Transcribes voice via Prisma STT -> Reasons over debt terms via Evon 30B ->
 * Synthesizes localized collection reminder via Timbre TTS.
 */
export async function khataVoiceHandler(req: Request, res: Response) {
  const { orgId, userId } = extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  // Transcribe audio if provided
  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
      mode: "transcribe",
    });
    transcript = requireLiveLedgerTranscript(transcription);
  }

  if (!transcript || typeof transcript !== "string") {
    throw new HttpError(400, "MISSING_TRANSCRIPT", "Spoken voice audio or transcript is required");
  }

  const result = await extractKhataDebtFromVoice({
    orgId,
    userId,
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    currency: body.currency || "INR",
    persist: true,
  });

  return res.status(201).json({
    success: true,
    data: {
      khata: result,
      modelsUsed: {
        stt: "Gnani Prisma v3.0",
        reasoning: "Gnani Evon v3.3 30B",
        tts: "Gnani Timbre (beta)",
      },
    },
  });
}

/**
 * Handles spoken BFSI Mudra & MSME Lead Qualification and automated underwriting.
 * Transcribes voice via Prisma STT -> Evaluates DSCR & scheme via Evon 30B ->
 * Synthesizes localized pre-qualification decision via Timbre TTS.
 */
export async function leadQualificationVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  if (!transcript || typeof transcript !== "string") {
    throw new HttpError(400, "MISSING_TRANSCRIPT", "Spoken voice audio or transcript is required");
  }

  const result = await qualifyLeadFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    currency: body.currency || "INR",
  });

  return res.json({
    success: true,
    data: {
      qualification: result,
      modelsUsed: {
        stt: "Gnani Prisma v3.0",
        reasoning: "Gnani Evon v3.3 30B (BFSI Underwriter)",
        tts: "Gnani Timbre (beta)",
      },
    },
  });
}

/**
 * Handles spoken BFSI Customer Care & UPI Dispute Redressal queries.
 * Integrates Gnani Prisma v3.0 STT, Evon 30B reasoning for RBI T+1 TAT & ₹100/day penalty calculation,
 * and synthesizes Timbre voice reassurance.
 */
export async function disputeVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  if (!transcript || typeof transcript !== "string") {
    throw new HttpError(400, "MISSING_TRANSCRIPT", "Spoken voice audio or transcript is required");
  }

  const dispute = await resolveDisputeFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    currency: body.currency || "INR",
  });

  return res.json({
    success: true,
    data: {
      dispute,
      modelsUsed: {
        stt: "Gnani Prisma v3.0",
        reasoning: "Gnani Evon v3.3 30B (Dispute Redressal Agent)",
        tts: "Gnani Timbre (beta)",
      },
    },
  });
}

/**
 * Handles speech acoustic analytics, sentiment analysis, SNR improvement measurement,
 * and compliance verification (RBI Fair Practices & Voice Biometrics).
 */
export async function analyticsVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const analytics = analyzeSpeechAcoustics({
    transcript: transcript || "Kirana purchase logged via Indic voice",
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    audioDurationSeconds: body.audioDurationSeconds ? Number(body.audioDurationSeconds) : undefined,
  });

  return res.json({
    success: true,
    data: {
      analytics,
      transcript: transcript || "",
      modelsUsed: {
        analytics: "Gnani Speech Analytics Engine v2.4",
        biometrics: "Gnani Voice Biometrics Liveness Shield",
        asr: "Gnani Prisma v3.0",
      },
    },
  });
}

/**
 * Real-time Gnani Assist Co-Pilot endpoint providing live Next-Best-Action (NBA),
 * dynamic battle cards, and compliance checkpoints.
 */
export async function assistVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const assist = await generateAgentAssistInsights({
    transcript: transcript || "Expense and personal finance assistance",
    language: language !== "auto" ? language : "hi-IN",
    mode: body.mode || "expense",
  });

  return res.json({
    success: true,
    data: {
      assist,
      transcript: transcript || "",
      modelsUsed: {
        assist: "Gnani Assist Real-Time Engine v3.1",
        reasoning: "Gnani Evon v3.3 30B",
        stt: "Gnani Prisma v3.0",
      },
    },
  });
}

/**
 * Spoken Bharat Tax & GST Advisory handler.
 */
export async function taxAdvisorVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const financialYear = body.financialYear || "2024-25";
  const regimePreference = body.regimePreference || "auto";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  if (!transcript) {
    throw new HttpError(400, "MISSING_TRANSCRIPT_OR_AUDIO", "Voice audio or transcript required for tax advisory");
  }

  const result = await adviseTaxFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    financialYear,
    regimePreference,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Autonomous Spoken Vyapar Billing & GST Invoice handler.
 */
export async function billingVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const customerName = body.customerName;
  const customerPhone = body.customerPhone;
  const applyGst = body.applyGst !== false && body.applyGst !== "false";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  if (!transcript) {
    throw new HttpError(400, "MISSING_TRANSCRIPT_OR_AUDIO", "Voice audio or transcript required for billing invoice");
  }

  const result = await generateBillingInvoiceFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    customerName,
    customerPhone,
    applyGst,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Jan Kalyan Government Schemes Voice Navigator handler.
 */
export async function schemesVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const age = body.age ? Number(body.age) : undefined;
  const annualIncome = body.annualIncome ? Number(body.annualIncome) : undefined;
  const occupation = body.occupation;
  const gender = body.gender;

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  if (!transcript) {
    throw new HttpError(400, "MISSING_TRANSCRIPT_OR_AUDIO", "Voice audio or transcript required for government schemes navigator");
  }

  const result = await evaluateGovernmentSchemesFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    age,
    annualIncome,
    occupation,
    gender,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Voice Biometrics Liveness Gate and Passphrase Verification handler.
 */
export async function biometricsVoiceHandler(req: Request, res: Response) {
  const { userId } = extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript || body.passphrase;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const action = body.action || "verify";
  const amount = body.amount ? Number(body.amount) : undefined;

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await verifyVoiceBiometricsLiveness({
    passphrase: transcript || "Mera aawaz meri pehchan hai",
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    userId,
    action,
    amount,
    telephonic,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Autonomous BPO & Contact Center 100% Call QA Auditing & Agent Scoring handler.
 */
export async function bpoAuditVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic !== false && body.telephonic !== "false";
  const agentName = body.agentName || "Vikram (Senior Advisor)";
  const customerName = body.customerName || "Ramesh Patel";
  const campaignType = body.campaignType || "inbound_support";
  const callDurationSeconds = body.callDurationSeconds ? Number(body.callDurationSeconds) : 185;

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await auditBpoContactCenterCallFromVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    agentName,
    customerName,
    campaignType,
    telephonic,
    callDurationSeconds,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY Voice Copilot handler.
 */
export async function healthcareVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const patientAge = body.patientAge ? Number(body.patientAge) : 42;
  const patientGender = body.patientGender || "male";
  const hasAyushmanBharat = body.hasAyushmanBharat !== false && body.hasAyushmanBharat !== "false";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await healthcareClinicalIntakeVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    patientAge,
    patientGender,
    hasAyushmanBharat,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Connected Automobile In-Cabin Voice & FASTag/Telematics Copilot handler.
 */
export async function automotiveVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic !== false && body.telephonic !== "false";
  const vehicleRegNumber = body.vehicleRegNumber || "KA 01 MJ 4022";
  const fastagBank = body.fastagBank || "State Bank of India (NETC FASTag)";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic: true,
    });
    transcript = transcription.transcript;
  }

  const result = await automotiveInCabinVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    vehicleRegNumber,
    fastagBank,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Real Estate Spoken EMI & PMAY Housing Subsidy Voice Copilot handler.
 */
export async function realEstateVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const propertyCostInr = body.propertyCostInr ? Number(body.propertyCostInr) : 6500000;
  const downpaymentInr = body.downpaymentInr ? Number(body.downpaymentInr) : 1500000;
  const tenureYears = body.tenureYears ? Number(body.tenureYears) : 20;
  const city = body.city || "Bengaluru, Karnataka";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await realEstateHousingCopilotVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    propertyCostInr,
    downpaymentInr,
    tenureYears,
    city,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Hospitality Spoken Concierge & Dining/Hotel Reservation Copilot handler.
 */
export async function hospitalityVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic === true || body.telephonic === "true";
  const guestsCount = body.guestsCount ? Number(body.guestsCount) : 2;
  const checkInDate = body.checkInDate;
  const city = body.city || "Jaipur, Rajasthan";
  const serviceType = body.serviceType || "hotel_booking";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await hospitalityConciergeVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    guestsCount,
    checkInDate,
    city,
    serviceType,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Consumer Durables Spoken Warranty, AMC & Appliance Support Desk handler.
 */
export async function consumerDurablesVoiceHandler(req: Request, res: Response) {
  extractUserAndOrg(req);

  const file = (req as any).file;
  const body = req.body || {};

  let transcript = body.transcript;
  const language = body.language || "auto";
  const telephonic = body.telephonic !== false && body.telephonic !== "false";
  const applianceCategory = body.applianceCategory || "air_conditioner";
  const brand = body.brand || "LG Electronics India";
  const issueDescription = body.issueDescription;
  const warrantyStatus = body.warrantyStatus || "in_warranty";

  if (!transcript && (file || body.audioBase64)) {
    const transcription = await transcribeAudioPrisma({
      audioBuffer: file ? file.buffer : undefined,
      audioBase64: body.audioBase64,
      mimeType: file ? file.mimetype : "audio/webm",
      language,
      telephonic,
    });
    transcript = transcription.transcript;
  }

  const result = await consumerDurablesSupportVoice({
    transcript,
    language: language !== "auto" ? language : "hi-IN",
    telephonic,
    applianceCategory,
    brand,
    issueDescription,
    warrantyStatus,
  });

  return res.json({
    success: true,
    data: result,
  });
}

/**
 * Returns list of supported Indic languages.
 */
export async function getVoiceLanguagesHandler(_req: Request, res: Response) {
  return res.json({
    success: true,
    data: INDIC_LANGUAGES,
  });
}

/**
 * Returns Gnani AI platform status, credits, and active models.
 */
export async function getVoiceStatusHandler(_req: Request, res: Response) {
  const status = getGnaniPlatformStatus();
  return res.json({
    success: true,
    data: status,
  });
}
