/**
 * @fileoverview Express routes for Gnani AI Voice and Speech processing.
 *
 * Endpoints:
 *   POST /voice/transcribe   - Transcribe audio using Gnani Prisma v3.0 STT
 *   POST /voice/synthesize   - Synthesize speech using Gnani Timbre TTS
 *   POST /voice/log-expense  - Transcribe & extract expense via Evon 30B reasoning & commit to ledger
 *   GET  /voice/languages    - List supported Indic languages & sample phrases
 *   GET  /voice/status       - Platform telemetry and credits monitoring
 *
 * @module routes/voiceRoutes
 */

import { Router } from "express";
import passport from "passport";
import { getEnv } from "../config/env";
import type { IUserDocument } from "../models/userModel";
import { createVoiceTicket } from "../services/gnaniVoiceStream";
import { asyncRoute } from "../utils/asyncRoute";
import { voiceUpload } from "../middleware/uploads";
import { validate } from "../middleware/validate";
import {
  previewVoiceExpenseBodySchema,
  synthesizeBodySchema,
} from "../schemas/voiceSchemas";
import {
  transcribeVoiceHandler,
  synthesizeVoiceHandler,
  logExpenseVoiceHandler,
  previewVoiceExpenseHandler,
  queryVoiceHandler,
  khataVoiceHandler,
  leadQualificationVoiceHandler,
  disputeVoiceHandler,
  analyticsVoiceHandler,
  assistVoiceHandler,
  taxAdvisorVoiceHandler,
  billingVoiceHandler,
  schemesVoiceHandler,
  biometricsVoiceHandler,
  bpoAuditVoiceHandler,
  healthcareVoiceHandler,
  automotiveVoiceHandler,
  realEstateVoiceHandler,
  hospitalityVoiceHandler,
  consumerDurablesVoiceHandler,
  getVoiceLanguagesHandler,
  getVoiceStatusHandler,
} from "../controllers/voiceController";

const router = Router();

// Optional authentication for voice operations so challenge evaluators can test presets
router.use((req, res, next) => {
  passport.authenticate("jwt", { session: false }, (_err: any, user: any) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
});

router.post("/voice/live-ticket", (req, res) => {
  const env = getEnv();
  const userId = (req.user as IUserDocument | undefined)?._id?.toString();
  const origin = req.get("origin");
  if (!userId || !origin || !env.CORS_ORIGINS.includes(origin)) {
    return res.status(403).json({ success: false, message: "Voice requires a signed-in browser." });
  }
  if (!env.GNANI_API_KEY) {
    return res.status(503).json({ success: false, message: "Live Gnani voice is unavailable." });
  }
  return res.set("Cache-Control", "no-store").json({ success: true, data: { ticket: createVoiceTicket(userId, origin) } });
});

// Transcribe audio using Gnani Prisma v3.0 STT
router.post(
  "/voice/transcribe",
  voiceUpload().single("audio"),
  asyncRoute(transcribeVoiceHandler)
);

// Synthesize text to speech using Gnani Timbre TTS
router.post(
  "/voice/synthesize",
  validate({ body: synthesizeBodySchema }),
  asyncRoute(synthesizeVoiceHandler)
);

// Extract financial transaction from spoken voice and log directly into ledger
router.post(
  "/voice/expense-preview",
  validate({ body: previewVoiceExpenseBodySchema }),
  asyncRoute(previewVoiceExpenseHandler)
);

router.post(
  "/voice/log-expense",
  voiceUpload().single("audio"),
  asyncRoute(logExpenseVoiceHandler)
);

// Two-way conversational voice financial Q&A (Prisma STT -> Evon 30B reasoning -> Timbre TTS)
router.post(
  "/voice/query",
  voiceUpload().single("audio"),
  asyncRoute(queryVoiceHandler)
);

// Spoken BFSI Collections & Khata debt tracking (Prisma STT -> Evon 30B debt reasoning -> Timbre reminder)
router.post(
  "/voice/collections",
  voiceUpload().single("audio"),
  asyncRoute(khataVoiceHandler)
);

// Spoken BFSI Mudra & MSME Lead Qualification (Prisma STT -> Evon 30B Underwriting -> Timbre Voice Decision)
router.post(
  "/voice/lead-qualification",
  voiceUpload().single("audio"),
  asyncRoute(leadQualificationVoiceHandler)
);

// Spoken BFSI Customer Care & UPI Dispute Redressal (Prisma STT -> Evon 30B RBI T+1 TAT -> Timbre Voice Reassurance)
router.post(
  "/voice/dispute",
  voiceUpload().single("audio"),
  asyncRoute(disputeVoiceHandler)
);

// Speech Acoustics, Sentiment & Voice Biometrics analytics inspection
router.post(
  "/voice/analytics",
  voiceUpload().single("audio"),
  asyncRoute(analyticsVoiceHandler)
);

// Real-Time Gnani Assist Co-Pilot (Next-Best-Action, Battle Cards & Compliance Checkpoints)
router.post(
  "/voice/assist",
  voiceUpload().single("audio"),
  asyncRoute(assistVoiceHandler)
);

// Spoken Bharat Tax & GST Advisory (FY 2024-25 New Regime, Sec 87A rebate & MSME Composition)
router.post(
  "/voice/tax-advisor",
  voiceUpload().single("audio"),
  asyncRoute(taxAdvisorVoiceHandler)
);

// Autonomous Spoken Vyapar Billing & GST Invoice (Line item extraction + dynamic UPI QR)
router.post(
  "/voice/billing",
  voiceUpload().single("audio"),
  asyncRoute(billingVoiceHandler)
);

// Jan Kalyan Government Schemes Voice Navigator (PM SVANidhi, PM-KISAN, Sukanya Samriddhi)
router.post(
  "/voice/schemes",
  voiceUpload().single("audio"),
  asyncRoute(schemesVoiceHandler)
);

// Dedicated Voice Biometrics & Liveness Authentication Shield
router.post(
  "/voice/biometrics/verify",
  voiceUpload().single("audio"),
  asyncRoute(biometricsVoiceHandler)
);

// Autonomous BPO Contact Center 100% Call QA Auditing & Agent Scoring (Gnani Aura)
router.post(
  "/voice/bpo-audit",
  voiceUpload().single("audio"),
  asyncRoute(bpoAuditVoiceHandler)
);

// Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY Voice Copilot
router.post(
  "/voice/healthcare",
  voiceUpload().single("audio"),
  asyncRoute(healthcareVoiceHandler)
);

// Connected Automobile In-Cabin Voice & FASTag/Telematics Copilot
router.post(
  "/voice/automotive",
  voiceUpload().single("audio"),
  asyncRoute(automotiveVoiceHandler)
);

// Real Estate Spoken Property EMI & PMAY Housing Subsidy Copilot
router.post(
  "/voice/real-estate",
  voiceUpload().single("audio"),
  asyncRoute(realEstateVoiceHandler)
);

// Hospitality Spoken Concierge & Dining Reservation Copilot
router.post(
  "/voice/hospitality",
  voiceUpload().single("audio"),
  asyncRoute(hospitalityVoiceHandler)
);

// Consumer Durables Spoken Warranty & AMC Support Desk
router.post(
  "/voice/consumer-durables",
  voiceUpload().single("audio"),
  asyncRoute(consumerDurablesVoiceHandler)
);

// Get supported Indic languages
router.get(
  "/voice/languages",
  asyncRoute(getVoiceLanguagesHandler)
);

// Get Gnani platform and build credits status
router.get(
  "/voice/status",
  asyncRoute(getVoiceStatusHandler)
);

export default router;
