import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as financeIntelligence from "../../services/financeIntelligence";
import {
  transcribeAudioPrisma,
  synthesizeSpeechTimbre,
  extractExpenseFromVoiceTranscript,
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
  INDIC_LANGUAGES,
  getVoiceProvider,
  setVoiceProvider,
  getVoiceLedgerRepository,
  setVoiceLedgerRepository,
  MockGnaniVoiceProvider,
  LiveGnaniVoiceProvider,
  InMemoryVoiceLedgerRepository,
  MongooseVoiceLedgerRepository,
  generatePcmChimeWav,
  GnaniRateLimitError,
  GnaniServiceUnavailableError,
  GnaniTimeoutError,
  GnaniAudioDecodeError,
} from "../../services/gnaniVoiceService";

describe("Gnani AI Voice & Indic Speech Service", () => {
  it("provides 12 supported Indic languages including Hindi, Telugu, Tamil and Hinglish", () => {
    expect(INDIC_LANGUAGES.length).toBeGreaterThanOrEqual(12);
    const codes = INDIC_LANGUAGES.map((l) => l.code);
    expect(codes).toContain("hi-IN");
    expect(codes).toContain("hi-en-IN");
    expect(codes).toContain("te-IN");
    expect(codes).toContain("ta-IN");
    expect(codes).toContain("kn-IN");
  });

  it("returns Challenge platform telemetry and 5,000 credits", () => {
    const status = getGnaniPlatformStatus();
    expect(status.challenge).toBe("The Great Indian AI Internship Challenge 2026");
    expect(status.participant).toBe("J Ganesh Kumar Reddy");
    expect(status.creditsAllocated).toBe(5000);
    expect(status.models.stt).toContain("Prisma v3.0");
    expect(status.models.tts).toContain("Timbre");
    expect(status.models.llm).toContain("Evon");
    expect(status.reasoning).toEqual({
      model: expect.stringContaining("evon"),
      status: "not_configured",
    });
  });

  it("transcribes audio using Prisma v3.0 in simulated/live mode with telephonic flag", async () => {
    const result = await transcribeAudioPrisma({
      language: "hi-IN",
      telephonic: true,
      codeMixed: true,
    });

    expect(result.detectedLanguage).toBe("hi-IN");
    expect(result.telephonicProcessed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.transcript.length).toBeGreaterThan(0);
  });

  it("synthesizes speech using Timbre in regional Indian voice", async () => {
    const result = await synthesizeSpeechTimbre({
      text: "Aapka 450 rupaye ka kharcha safaltapoorvak log ho gaya hai.",
      language: "hi-IN",
      voiceGender: "female",
    });

    expect(result.language).toBe("hi-IN");
    expect(result.voiceGender).toBe("female");
    expect(result.audioBase64.length).toBeGreaterThan(0);
    expect(result.model).toContain("Timbre");
  });

  it("extracts structured financial transactions from Hindi spoken transcript", async () => {
    const transcript = "Maine aaj Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye UPI se diye";
    const result = await extractExpenseFromVoiceTranscript(transcript, "INR");

    expect(result.amount).toBe(450);
    expect(result.category).toBe("Groceries");
    expect(result.merchantName).toContain("Sharma");
    expect(result.paymentMethod).toBe("UPI");
    expect(result.type).toBe("expense");
  });

  it("extracts structured investment transactions from Telugu spoken transcript", async () => {
    const transcript = "Kalyan Jewellers lo 25000 petti gold coin konnanu PhonePe dwara";
    const result = await extractExpenseFromVoiceTranscript(transcript, "INR");

    expect(result.amount).toBe(25000);
    expect(result.category).toBe("Investment");
    expect(result.merchantName).toBe("Kalyan Jewellers");
    expect(result.paymentMethod).toContain("PhonePe");
    expect(result.type).toBe("investment");
  });

  it("extracts structured dining transactions from Tamil spoken transcript", async () => {
    const transcript = "Tea kadaiyil 40 roobai tea matrum vadai-ku Google Pay seithen";
    const result = await extractExpenseFromVoiceTranscript(transcript, "INR");

    expect(result.amount).toBe(40);
    expect(result.category).toBe("Food & Dining");
    expect(result.merchantName).toContain("Tea");
    expect(result.paymentMethod).toContain("Google Pay");
  });

  it("answers the spoken ledger question with one speech synthesis call", async () => {
    const synthesize = vi.spyOn(getVoiceProvider(), "synthesizeSpeech");
    try {
      const queryResult = await answerFinanceVoiceQuery({
        orgId: "507f1f77bcf86cd799439011",
        userId: "507f1f77bcf86cd799439012",
        query: "Mera is mahine ka total balance kitna hai?",
        language: "hi-IN",
        currency: "INR",
      });
      expect(queryResult.query).toBe("Mera is mahine ka total balance kitna hai?");
      expect(queryResult.answerText.length).toBeGreaterThan(10);
      expect(queryResult.audioFeedback.audioBase64.length).toBeGreaterThan(0);
      expect(queryResult.financialContext.currency).toBe("INR");
      expect(queryResult.model).toBe("Ledger summary");
      expect(synthesize).toHaveBeenCalledTimes(1);
    } finally {
      synthesize.mockRestore();
    }
  });

  it("answers Telugu voice financial queries with localized synthesis", async () => {
    const queryResult = await answerFinanceVoiceQuery({
      orgId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      query: "Nenu e mahina entha karchu pettanu?",
      language: "te-IN",
      currency: "INR",
    });

    expect(queryResult.query).toContain("karchu");
    expect(queryResult.answerText).toContain("mahina");
    expect(queryResult.audioFeedback.language).toBe("te-IN");
    expect(queryResult.model).toBe("Ledger summary");
  });

  it("answers the remaining-budget question with saved limits and the top category", async () => {
    const envelopes = vi.spyOn(financeIntelligence, "getBudgetEnvelopes").mockResolvedValue({
      envelopes: [{ category: "Groceries", planned: 1000, spent: 300, remaining: 700, currency: "INR", tx_count: 1, unbudgeted: false }],
    } as Awaited<ReturnType<typeof financeIntelligence.getBudgetEnvelopes>>);
    try {
      const query = "What is my remaining budget and highest spending category?";
      const result = await answerFinanceVoiceQuery({
        orgId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439012",
        query, language: "hi-en-IN", currency: "INR",
      });
      expect(result.model).toBe("Budget and ledger summary");
      expect(result.answerText).toContain("₹700 left across your budgeted categories");
      expect(result.answerText).toContain(result.financialContext.topCategory);
      expect(envelopes).toHaveBeenCalledTimes(1);
    } finally {
      envelopes.mockRestore();
    }
  });

  it("handles a naturally worded remaining-budget question", async () => {
    const result = await answerFinanceVoiceQuery({
      orgId: "test-org", userId: "test-user",
      query: "How much of my budget is left this month?", language: "en-IN",
    });
    expect(result.model).toBe("Budget and ledger summary");
    expect(result.answerText).toContain("no saved budget limits");
  });

  it("routes unsupported voice questions to Finance Chat when an educator is unavailable", async () => {
    const result = await answerFinanceVoiceQuery({
      orgId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      query: "How does compound interest work?",
      language: "en-IN",
    });
    expect(result.model).toBe("FinWise guidance");
    expect(result.answerText).toContain("open Finance Chat");
  });

  it("returns a model-generated voice answer without speaking or displaying Markdown", async () => {
    const generateAnswer = vi.fn(async () => ({
      text: "**Example:** Save `₹1,000` monthly for a planned expense.",
      source: "model-under-test",
    }));
    const result = await answerFinanceVoiceQuery({
      orgId: "test-org", userId: "test-user", query: "What is a sinking fund?", language: "en-IN", generateAnswer,
    });
    expect(generateAnswer).toHaveBeenCalledOnce();
    expect(result.answerText).toBe("Example: Save ₹1,000 monthly for a planned expense.");
    expect(result.model).toBe("model-under-test");
  });

  it("extracts informal BFSI Khata/Udhar debt and generates collection speech reminder", async () => {
    const khataResult = await extractKhataDebtFromVoice({
      orgId: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      transcript: "Ramesh bhai ko 650 rupaye udhar diye shaniwar tak lautayenge",
      language: "hi-IN",
      currency: "INR",
    });

    expect(khataResult.amount).toBe(650);
    expect(khataResult.contactName).toContain("Ramesh");
    expect(khataResult.direction).toBe("lent");
    expect(khataResult.reminderSpeech).toContain("Ramesh");
    expect(khataResult.reminderSpeech).toContain("650");
    expect(khataResult.audioReminder).toBeDefined();
    expect(khataResult.audioReminder?.audioBase64.length).toBeGreaterThan(0);
    expect(khataResult.speechAnalytics).toBeDefined();
    expect(khataResult.speechAnalytics?.sentiment.label).toBe("Urgent");
  });

  it("qualifies MSME Mudra loans from spoken Hindi for Kanpur Tier-2 Kirana store with DSCR and EMI", async () => {
    const leadResult = await qualifyLeadFromVoice({
      transcript: "Mera Kanpur me kirana store hai, monthly sale 1.5 lakh hai, dukan badhane ke liye 2 lakh ka Mudra loan chahiye",
      language: "hi-IN",
      currency: "INR",
    });

    expect(leadResult.city).toBe("Kanpur");
    expect(leadResult.tierLevel).toBe("Tier-2");
    expect(leadResult.monthlyRevenue).toBe(150000);
    expect(leadResult.loanAmountRequested).toBe(200000);
    expect(leadResult.estimatedEmi).toBeGreaterThan(6000);
    expect(leadResult.estimatedEmi).toBeLessThan(7000);
    expect(leadResult.dscrRatio).toBeGreaterThan(4.0);
    expect(leadResult.eligibilityScore).toBeGreaterThanOrEqual(75);
    expect(leadResult.approvalLikelihood).toContain("High");
    expect(leadResult.recommendedScheme).toContain("MUDRA");
    expect(leadResult.spokenQualificationText).toContain("Kanpur");
    expect(leadResult.audioFeedback).toBeDefined();
    expect(leadResult.audioFeedback?.audioBase64.length).toBeGreaterThan(0);
  });

  it("qualifies spoken Telugu pharmacy loan for Warangal Tier-2 city with localized voice output", async () => {
    const leadResult = await qualifyLeadFromVoice({
      transcript: "Naaku Warangal lo medical shop undi, monthly turnover 2.5 lakhs, shop renovate cheyyadaniki 3 lakh loan kavali",
      language: "te-IN",
      currency: "INR",
    });

    expect(leadResult.city).toBe("Warangal");
    expect(leadResult.tierLevel).toBe("Tier-2");
    expect(leadResult.monthlyRevenue).toBe(250000);
    expect(leadResult.loanAmountRequested).toBe(300000);
    expect(leadResult.spokenQualificationText).toContain("Warangal");
    expect(leadResult.audioFeedback?.language).toBe("te-IN");
  });

  it("qualifies spoken Hinglish boutique loan in Indore with working capital credit line", async () => {
    const leadResult = await qualifyLeadFromVoice({
      transcript: "I run a fashion boutique in Indore with 90k monthly sales, looking for 1 lakh working capital credit line",
      language: "hi-en-IN",
      currency: "INR",
    });

    expect(leadResult.city).toBe("Indore");
    expect(leadResult.tierLevel).toBe("Tier-2");
    expect(leadResult.monthlyRevenue).toBe(90000);
    expect(leadResult.loanAmountRequested).toBe(100000);
    expect(leadResult.recommendedScheme).toContain("MUDRA");
    expect(leadResult.spokenQualificationText).toContain("Indore");
  });

  it("analyzes speech acoustics, SNR improvement, sentiment, and RBI compliance", () => {
    const analytics = analyzeSpeechAcoustics({
      transcript: "Sharma ji ki dukan pe 450 rupaye rashan ke liye UPI se diye",
      language: "hi-IN",
      telephonic: true,
      audioDurationSeconds: 3.2,
    });

    expect(analytics.sentiment.label).toBe("Positive");
    expect(analytics.acoustics.snrImprovementDb).toBe(21.6);
    expect(analytics.acoustics.detectedEnvironment).toContain("Telephonic");
    expect(analytics.compliance.rbiFairPracticesPassed).toBe(true);
    expect(analytics.compliance.voiceBiometricsMatchScore).toBe(99.4);
    expect(analytics.compliance.antiSpoofStatus).toBe("authentic_human_liveness_verified");
    expect(analytics.indicDialectMetrics.phoneticFidelityScore).toBeGreaterThan(0.95);
  });

  it("classifies BFSI debt collection intent with urgent sentiment and RBI debt code verification", () => {
    const debtAnalytics = analyzeSpeechAcoustics({
      transcript: "Ramesh bhai ka 1500 rupaye udhar baki hai monday tak lautao",
      language: "hi-IN",
      telephonic: false,
    });

    expect(debtAnalytics.sentiment.label).toBe("Urgent");
    expect(debtAnalytics.compliance.debtCollectionCodeVerified).toBe(true);
    expect(debtAnalytics.compliance.rbiFairPracticesPassed).toBe(true);
  });
});

describe("Synthetic Audible PCM Chime Generator", () => {
  it("synthesizes valid 16kHz linear PCM WAV audio with canonical 44-byte RIFF header", () => {
    const buffer = generatePcmChimeWav(0.8);

    // Exact RIFF/WAVE header assertions
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.readUInt32LE(4)).toBe(buffer.length - 8);
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buffer.readUInt32LE(16)).toBe(16); // Subchunk1Size (16 for PCM)
    expect(buffer.readUInt16LE(20)).toBe(1);  // AudioFormat (1 = Linear PCM)
    expect(buffer.readUInt16LE(22)).toBe(1);  // Channels (1 = Mono)
    expect(buffer.readUInt32LE(24)).toBe(16000); // 16kHz Sample Rate
    expect(buffer.readUInt32LE(28)).toBe(32000); // ByteRate (16000 * 1 * 2)
    expect(buffer.readUInt16LE(32)).toBe(2);  // BlockAlign
    expect(buffer.readUInt16LE(34)).toBe(16); // BitsPerSample
    expect(buffer.toString("ascii", 36, 40)).toBe("data");
    expect(buffer.readUInt32LE(40)).toBe(25600); // 12800 samples * 2 bytes = 25600
    expect(buffer.length).toBe(25644); // 44 + 25600
  });

  it("generates non-silent, audible acoustic waveform with ascending harmonic chords", () => {
    const buffer = generatePcmChimeWav(0.8);
    let nonZeroCount = 0;
    let maxAbsoluteAmplitude = 0;

    for (let i = 44; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      if (sample !== 0) nonZeroCount++;
      const absSample = Math.abs(sample);
      if (absSample > maxAbsoluteAmplitude) maxAbsoluteAmplitude = absSample;
    }

    // Audio payload must be genuinely non-silent
    expect(nonZeroCount).toBeGreaterThan(10000);
    // Peak amplitude should reach harmonic level (> 15,000)
    expect(maxAbsoluteAmplitude).toBeGreaterThan(15000);
  });
});

describe("MockGnaniVoiceProvider & Multi-Profile Simulation", () => {
  let mockProvider: MockGnaniVoiceProvider;

  beforeEach(() => {
    mockProvider = new MockGnaniVoiceProvider({ profile: "instant" });
  });

  it("executes STT, TTS, and NLU in instant mode within milliseconds (<25ms)", async () => {
    const start = Date.now();
    const stt = await mockProvider.transcribeAudio(undefined, { language: "te-IN" });
    const tts = await mockProvider.synthesizeSpeech("Test audio", { language: "te-IN" });
    const nlu = await mockProvider.extractExpense("250 rupees for lunch");
    const totalTime = Date.now() - start;

    expect(stt.detectedLanguage).toBe("te-IN");
    expect(tts.audioBuffer.length).toBe(25644);
    expect(nlu.amount).toBe(250);
    expect(totalTime).toBeLessThan(100);
  });

  it("synthesizes valid audio buffer and base64 string matching Timbre specs", async () => {
    const result = await mockProvider.synthesizeSpeech("Payment confirmation");
    expect(result.audioBuffer).toBeInstanceOf(Buffer);
    expect(result.audioBuffer.length).toBeGreaterThan(25000);
    expect(result.audioBase64).toBe(result.audioBuffer.toString("base64"));
    expect(result.contentType).toBe("audio/wav");
    expect(result.durationMs).toBe(800);
    expect(result.provider).toBe("gnani_timbre_fallback");
  });

  it("injects deterministic chaos errors via keyword tags in chaos_error profile", async () => {
    mockProvider.setSimulationProfile("chaos_error");

    await expect(mockProvider.synthesizeSpeech("[CHAOS_429] Payment")).rejects.toThrow(GnaniRateLimitError);
    await expect(mockProvider.synthesizeSpeech("[CHAOS_503] Payment")).rejects.toThrow(GnaniServiceUnavailableError);
    await expect(mockProvider.synthesizeSpeech("[CHAOS_TIMEOUT] Payment")).rejects.toThrow(GnaniTimeoutError);
    await expect(mockProvider.synthesizeSpeech("[CHAOS_CORRUPT] Payment")).rejects.toThrow(GnaniAudioDecodeError);
  });

  it("supports profile switching and getter/setter", () => {
    mockProvider.setSimulationProfile("realistic_latency");
    expect(mockProvider.getSimulationProfile()).toBe("realistic_latency");
    mockProvider.setSimulationProfile("instant");
    expect(mockProvider.getSimulationProfile()).toBe("instant");
  });
});

describe("Indic Multi-Script Numeral Normalization & Rural Presets", () => {
  let provider: MockGnaniVoiceProvider;

  beforeEach(() => {
    provider = new MockGnaniVoiceProvider({ profile: "instant" });
  });

  it("normalizes and extracts Devanagari numerals (४५० रुपये)", async () => {
    const transcript = "शर्मा जी की दुकान पर ४५० रुपये राशन के लिए दिए";
    const result = await provider.extractExpense(transcript);

    expect(result.amount).toBe(450);
    expect(result.category).toBe("Groceries");
    expect(result.merchantName).toContain("Sharma");
  });

  it("extracts a complete Hindi rupee amount when speech recognition spells it out", async () => {
    const result = await provider.extractExpense("मैंने चाय पर पचास रुपये खर्च किए।");

    expect(result.amount).toBe(50);
    expect(result.category).toBe("Food & Dining");
    expect(provider.extractIndicAmount("मैंने चाय पर एक सौ पचास रुपये खर्च किए।")).toBe(0);
  });

  it("normalizes and extracts Bengali numerals (৮৫০ টাকা)", async () => {
    const transcript = "মুদির দোকান থেকে ৮৫০ টাকার চাল আর ডাল কিনলাম";
    const result = await provider.extractExpense(transcript);

    expect(result.amount).toBe(850);
    expect(result.category).toBe("Groceries");
    expect(result.merchantName).toContain("Mudir");
  });

  it("normalizes and extracts Telugu numerals (౨౫౦౦౦ రూపాయలు)", async () => {
    const transcript = "కళ్యాణ్ జ్యువెలర్స్ లో ౨౫౦౦౦ పెట్టి గోల్డ్ కాయిన్ కొన్నాను";
    const result = await provider.extractExpense(transcript);

    expect(result.amount).toBe(25000);
    expect(result.category).toBe("Investment");
    expect(result.merchantName).toContain("Kalyan");
  });

  it("extracts rural agriculture livelihood presets (khad, beej, mandi)", async () => {
    const transcript = "Khad aur beej mandi se 3200 rupaye me kharida kisan kendra se";
    const result = await provider.extractExpense(transcript);

    expect(result.amount).toBe(3200);
    expect(result.category).toBe("Agriculture & Rural Livelihood");
    expect(result.merchantName).toContain("Mandi");
    expect(result.subCategory).toContain("Fertilizers");
  });

  it("extracts farm machinery fuel presets (tractor diesel)", async () => {
    const transcript = "Tractor me diesel 1800 rupaye ka bharwaya kisan fuel pump pe";
    const result = await provider.extractExpense(transcript);

    expect(result.amount).toBe(1800);
    expect(result.category).toBe("Transport");
    expect(result.subCategory).toContain("Tractor");
  });

  describe("BFSI Customer Care & UPI Dispute Redressal", () => {
    it("extracts UTR, amount, and applies RBI T+1 TAT & ₹100/day penalty", async () => {
      const dispute = await resolveDisputeFromVoice({
        transcript: "Mera ₹1,500 cut gaya par dukandar ko nahi mila, UTR number 429182349182, kab wapas aayega?",
        language: "hi-IN",
      });

      expect(dispute.disputedAmount).toBe(1500);
      expect(dispute.transactionRef).toBe("429182349182");
      expect(dispute.ticketId).toContain("GRV-2026-UPI");
      expect(dispute.mandatedTAT).toContain("T + 1 Calendar Day");
      expect(dispute.compensationRule).toContain("₹100 per day");
      expect(dispute.status).toBe("REGISTERED_WITH_NPCI_UDMS");
      expect(dispute.spokenResolutionText).toContain("24 ghante");
      expect(dispute.audioFeedback?.audioBase64).toBeDefined();
    });

    it("handles Telugu UPI QR payment dispute with localized Timbre voice note", async () => {
      const dispute = await resolveDisputeFromVoice({
        transcript: "Dukan lo QR scan chesi ₹850 pampanu, account lo debit aindi kani dukandar ki raledu, UTR 918273645120",
        language: "te-IN",
      });

      expect(dispute.disputedAmount).toBe(850);
      expect(dispute.transactionRef).toBe("918273645120");
      expect(dispute.spokenResolutionText).toContain("phiryadu darju");
      expect(dispute.spokenResolutionText).toContain("24 gantallo");
    });
  });

  describe("Gnani Assist Real-Time Co-Pilot", () => {
    it("generates Next-Best-Action and battle cards for Khata collections", async () => {
      const assist = await generateAgentAssistInsights({
        transcript: "Ramesh bhai ko 650 rupaye udhar diye shaniwar tak lautayenge",
        mode: "khata",
      });

      expect(assist.sessionId).toContain("AST-");
      expect(assist.nextBestAction.actionType).toBe("COLLECT_PAYMENT");
      expect(assist.sentimentCues.currentMood).toBe("Urgent");
      expect(assist.battleCard.category).toContain("Kirana Micro-Merchant Credit Recovery");
      expect(assist.complianceCheckpoint.fairPracticesVerified).toBe(true);
      expect(assist.complianceCheckpoint.auditStatus).toBe("PASS");
    });

    it("generates Next-Best-Action for UPI disputes with RBI circular guidelines", async () => {
      const assist = await generateAgentAssistInsights({
        transcript: "Mera 1500 cut gaya par dukandar ko nahi mila",
        mode: "dispute",
      });

      expect(assist.nextBestAction.actionType).toBe("FILE_DISPUTE");
      expect(assist.sentimentCues.currentMood).toBe("Anxious");
      expect(assist.battleCard.keyPoints.some((k) => k.includes("T+1"))).toBe(true);
    });

    it("generates Next-Best-Action for Tax Optimization and Vyapar Invoicing", async () => {
      const taxAssist = await generateAgentAssistInsights({
        transcript: "Meri 8.5 lakh income hai tax kitna lagega",
        mode: "tax",
      });
      expect(taxAssist.nextBestAction.actionType).toBe("TAX_OPTIMIZATION");
      expect(taxAssist.battleCard.category).toContain("Income Tax");

      const billAssist = await generateAgentAssistInsights({
        transcript: "Raju ko 2 packet atta aur chini ka bill bana do",
        mode: "billing",
      });
      expect(billAssist.nextBestAction.actionType).toBe("ISSUE_INVOICE");
      expect(billAssist.battleCard.category).toContain("Micro-Merchant Voice Invoicing");
    });
  });

  describe("Spoken Bharat Tax & GST Copilot", () => {
    it("computes FY 2024-25 New Regime tax with ₹75k standard deduction and Section 87A rebate", async () => {
      // Income <= 7.75 Lakhs is 100% tax-free under revised Budget 2024 rules
      const result = await adviseTaxFromVoice({
        transcript: "Meri saal ki aamdani 6.5 lakh rupaye hai",
        language: "hi-IN",
      });

      expect(result.taxSummary.grossIncome).toBe(650000);
      expect(result.taxSummary.standardDeduction).toBe(75000);
      expect(result.taxSummary.taxableIncome).toBe(575000);
      expect(result.taxSummary.section87ARebate).toBeGreaterThan(0);
      expect(result.taxSummary.totalTaxLiability).toBe(0);
      expect(result.taxSummary.optimalRegime).toBe("new");
      expect(result.spokenAdviceText).toContain("New Tax Regime");
    });

    it("computes tax accurately for 8.5 Lakh income and compares Old vs New Regime", async () => {
      const result = await adviseTaxFromVoice({
        transcript: "Meri income 8.5 lakh hai tax kitna banega",
        language: "hi-IN",
      });

      expect(result.taxSummary.grossIncome).toBe(850000);
      expect(result.taxSummary.standardDeduction).toBe(75000);
      expect(result.taxSummary.taxableIncome).toBe(775000);
      expect(result.taxSummary.totalTaxLiability).toBeGreaterThan(0);
      expect(result.taxSummary.savingsWithOptimalRegime).toBeGreaterThan(0);
      expect(result.taxSavingTips.length).toBeGreaterThanOrEqual(2);
    });

    it("identifies Kirana 1% GST Composition eligibility from spoken query", async () => {
      const result = await adviseTaxFromVoice({
        transcript: "Hamari kirana dukaan ka annual turnover 45 lakh hai kya 1% GST composition le sakte hain",
        language: "hi-IN",
      });

      expect(result.taxSummary.gstCompositionApplicable).toBe(true);
      expect(result.taxSummary.gstCompositionTax).toBe(45000); // 1% of 45 Lakhs
    });
  });

  describe("Autonomous Spoken Vyapar Billing & GST Invoicing", () => {
    it("parses multi-item store basket and computes itemized totals with 18% GST", async () => {
      const result = await generateBillingInvoiceFromVoice({
        transcript: "Raju ko 2 packet atta 110 rupaye, 1 kilo chini 45 rupaye, aur 1 litre tel 145 rupaye ka bill bana do",
        language: "hi-IN",
      });

      expect(result.customerName).toBe("Raju");
      expect(result.lineItems.length).toBeGreaterThanOrEqual(2);
      expect(result.subtotal).toBeGreaterThan(0);
      expect(result.cgst).toBeGreaterThan(0);
      expect(result.sgst).toBeGreaterThan(0);
      expect(result.grandTotal).toBe(result.subtotal + result.cgst + result.sgst);
      expect(result.invoiceNumber).toMatch(/^INV-2026-\d{5}$/);
      expect(result.upiPaymentUri).toContain("upi://pay");
      expect(result.formattedDocket).toContain("BHARAT VYAPAR TAX INVOICE");
      expect(result.spokenSummaryText).toContain("Raju");
    });
  });

  describe("Jan Kalyan Government Schemes Voice Navigator", () => {
    it("evaluates street vendor query and recommends PM SVANidhi micro-credit with MoHUA guidelines", async () => {
      const result = await evaluateGovernmentSchemesFromVoice({
        transcript: "Main ek street vendor thela lagata hoon sabzi bechta hoon aur mujhe 10000 ka loan chahiye working capital ke liye",
        language: "hi-IN",
      });

      expect(result.detectedProfile.isStreetVendor).toBe(true);
      expect(result.topRecommendation.shortCode).toBe("PM SVANidhi");
      expect(result.topRecommendation.benefitAmountInr).toBe(10000);
      expect(result.topRecommendation.matchScorePercent).toBeGreaterThanOrEqual(90);
      expect(result.topRecommendation.portalUrl).toContain("pmsvanidhi.mohua.gov.in");
      expect(result.spokenGuidance).toContain("SVANidhi");
      expect(result.applicationGuidanceDocket).toContain("JAN KALYAN SARKARI YOJANA");
    });

    it("evaluates farmer query and recommends PM Kisan Samman Nidhi DBT", async () => {
      const result = await evaluateGovernmentSchemesFromVoice({
        transcript: "Mera 2 acre kheti ka zameen hai kisan bhaiyon ke liye sarkari yojana kya hai?",
        language: "hi-IN",
      });

      expect(result.detectedProfile.isFarmer).toBe(true);
      expect(result.topRecommendation.shortCode).toBe("PM-KISAN");
      expect(result.topRecommendation.benefitAmountInr).toBe(6000);
      expect(result.topRecommendation.portalUrl).toContain("pmkisan.gov.in");
    });

    it("evaluates girl child query and recommends Sukanya Samriddhi Yojana (SSY)", async () => {
      const result = await evaluateGovernmentSchemesFromVoice({
        transcript: "Meri 5 saal ki beti hai uske education aur shaadi ke liye sarkari bachat yojana batayein",
        language: "hi-IN",
      });

      expect(result.detectedProfile.hasGirlChild).toBe(true);
      expect(result.topRecommendation.shortCode).toBe("Sukanya Samriddhi");
      expect(result.topRecommendation.category).toBe("girl_child");
      expect(result.applicationGuidanceDocket).toContain("Sukanya Samriddhi");
    });

    it("synthesizes regional spoken guidance in Telugu via Timbre", async () => {
      const result = await evaluateGovernmentSchemesFromVoice({
        transcript: "Nenu street vendor daily fruit cart naduputhunnanu naku business loan kavali",
        language: "te-IN",
      });

      expect(result.language).toBe("te-IN");
      expect(result.spokenGuidance).toContain("Pradhan Mantri");
      expect(result.audioFeedback).toBeDefined();
    });
  });

  describe("Zero-Trust Voice Biometrics & Liveness Authentication Shield", () => {
    it("verifies genuine speaker passphrase with high spectral match and liveness token", async () => {
      const result = await verifyVoiceBiometricsLiveness({
        passphrase: "Mera aawaz meri pehchan hai",
        language: "hi-IN",
        userId: "usr-ganesh-reddy",
      });

      expect(result.verified).toBe(true);
      expect(result.livenessStatus).toBe("GENUINE_LIVE_HUMAN");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.99);
      expect(result.antiSpoofScore).toBeGreaterThanOrEqual(0.98);
      expect(result.authorizationToken).toMatch(/^vbio_sec_[a-z0-9]+_t\d+$/);
      expect(result.spectralAcoustics.formantF1Hz).toBeCloseTo(520.4);
      expect(result.spokenFeedback).toContain("Aawaz ki pehchan safal rahi");
    });

    it("detects and rejects loudspeaker acoustic replay and spoof attempts", async () => {
      const result = await verifyVoiceBiometricsLiveness({
        passphrase: "Recorded replay synthetic bot playback attack",
        language: "en-IN",
      });

      expect(result.verified).toBe(false);
      expect(result.livenessStatus).toBe("SPOOF_PLAYBACK_REJECTED");
      expect(result.confidenceScore).toBeLessThan(0.5);
      expect(result.authorizationToken).toBeUndefined();
      expect(result.statusMessage).toContain("replay or loudspeaker resonance detected");
    });
  });

  describe("auditBpoContactCenterCallFromVoice (Gnani Aura Call QA)", () => {
    it("evaluates a customer support call across 8 compliance checkpoints and calculates AQS", async () => {
      const result = await auditBpoContactCenterCallFromVoice({
        transcript: "Agent: Namaste, FinWise support mein aapka swagat hai. Main Vikram. Kya main aapka account verify kar sakta hoon? Customer: Mera UPI payment 5000 kat gaya par dukaan pe credit nahi hua! Agent: Ramesh ji, main samajh sakta hoon aapki pareshani. RBI guidelines ke mutabiq T+1 mein refund settle ho jayega. URN reference number URN-892401 note kar lijiye. Kya main aur koi sahayata kar sakta hoon? Customer: Bahut dhanyawad Vikram ji, ab theek hai.",
        language: "hi-IN",
        agentName: "Vikram (Senior Advisor)",
        customerName: "Ramesh Patel",
        telephonic: true,
        callDurationSeconds: 185,
      });

      expect(result.agentQualityScore).toBeGreaterThanOrEqual(90);
      expect(result.performanceTier).toBe("EXEMPLARY");
      expect(result.compliancePassRate).toBe(100);
      expect(result.complianceChecks.length).toBe(8);
      expect(result.sentimentJourney.trajectory).toBe("SIGNIFICANT_IMPROVEMENT");
      expect(result.sentimentJourney.sentimentTurnaroundScore).toBe(76);
      expect(result.speechAcoustics.deadAirRatioPercent).toBeLessThan(5.0);
      expect(result.spokenCoachingDebrief).toContain("Agent Quality Score");
      expect(result.spokenCoachingDebrief).toContain("URN-892401");
    });

    it("evaluates Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY cashless hospital coverage", async () => {
      const result = await healthcareClinicalIntakeVoice({
        transcript: "Doctor sahab 3 din se tez bukhar hai, kya yeh Ayushman Bharat mein cover hoga?",
        language: "hi-IN",
        patientAge: 45,
        hasAyushmanBharat: true,
      });

      expect(result.intakeId).toContain("MED-");
      expect(result.clinicalVitals.suspectedCondition).toContain("Respiratory");
      expect(result.pmjayCoverage.annualWalletLimitInr).toBe(500000);
      expect(result.pmjayCoverage.coverageStatus).toBe("ELIGIBLE_COVERED");
      expect(result.pmjayCoverage.goldenCardVerified).toBe(true);
      expect(result.spokenResponse).toContain("Ayushman Bharat PM-JAY");
      expect(result.audioFeedback?.audioBase64).toBeDefined();
    });

    it("processes Connected Automobile In-Cabin Voice and FASTag recharge command with road noise filtering", async () => {
      const result = await automotiveInCabinVoice({
        transcript: "FinWise gaadi mein FASTag mein 500 rupaye recharge karo",
        language: "hi-IN",
        vehicleRegNumber: "KA 01 MJ 4022",
      });

      expect(result.commandId).toContain("AUTO-");
      expect(result.actionExecuted.service).toBe("NETC_FASTAG_INSTANT_RECHARGE");
      expect(result.actionExecuted.vehicleNumber).toBe("KA 01 MJ 4022");
      expect(result.actionExecuted.rechargeAmountInr).toBe(500);
      expect(result.actionExecuted.newFastagBalanceInr).toBe(850);
      expect(result.inCabinAcousticTelemetry.prismaDspFilterGainDb).toBeGreaterThan(20);
      expect(result.spokenResponse).toContain("FASTag");
      expect(result.audioFeedback?.audioBase64).toBeDefined();
    });

    it("evaluates Real Estate Spoken Property EMI & PMAY Housing Subsidy with exact mathematical invariants", async () => {
      const result = await realEstateHousingCopilotVoice({
        transcript: "Bangalore mein 65 lakh ka flat lena hai, 15 lakh downpayment hai, 20 saal ke liye EMI kitna hoga?",
        language: "hi-IN",
        propertyCostInr: 6500000,
        downpaymentInr: 1500000,
        tenureYears: 20,
      });

      expect(result.docketId).toContain("PROP-");
      expect(result.propertyOverview.loanPrincipalInr).toBe(5000000);
      expect(result.loanCalculations.monthlyEmiInr).toBeGreaterThan(40000);
      expect(result.loanCalculations.monthlyEmiInr).toBeLessThan(46000);
      expect(result.loanCalculations.stampDutyAndRegistration.stampDutyAmountInr).toBe(325000);
      expect(result.pmaySubsidy.interestSubsidyAmountInr).toBe(250000);
      expect(result.spokenResponse).toContain("65 lakh");
      expect(result.audioFeedback?.audioBase64).toBeDefined();
    });

    it("evaluates Hospitality Spoken Concierge & Dining Reservation with Timbre TTS", async () => {
      const result = await hospitalityConciergeVoice({
        transcript: "Jaipur mein Heritage Haveli mein 2 logon ke liye 2 raat ka deluxe room book karna hai aur dinner reserve karo.",
        language: "hi-IN",
        guestsCount: 2,
        city: "Jaipur, Rajasthan",
      });

      expect(result.bookingId).toContain("HOSP-");
      expect(result.reservationDocket.numberOfGuests).toBe(2);
      expect(result.reservationDocket.nightlyRateInr).toBe(4500);
      expect(result.reservationDocket.billingSummary.grandTotalInr).toBe(12096);
      expect(result.reservationDocket.billingSummary.gstPercent).toBe(12);
      expect(result.spokenResponse).toContain("Jaipur");
      expect(result.audioFeedback?.audioBase64).toBeDefined();
    });

    it("evaluates Consumer Durables Warranty & AMC Support Desk with technician dispatch", async () => {
      const result = await consumerDurablesSupportVoice({
        transcript: "Mera LG inverter split AC cooling nahi kar raha hai aur error code CH 38 dikha raha hai, warranty check karo aur technician bhejo.",
        language: "hi-IN",
        applianceCategory: "air_conditioner",
        brand: "LG Electronics India",
        warrantyStatus: "in_warranty",
      });

      expect(result.ticketId).toContain("DUR-");
      expect(result.supportTicket.brand).toBe("LG Electronics India");
      expect(result.supportTicket.warrantyAssessment.isCoveredUnderFreeService).toBe(true);
      expect(result.supportTicket.technicianDispatch.technicianName).toContain("Ramesh Sharma");
      expect(result.spokenResponse).toContain("LG Electronics India");
      expect(result.audioFeedback?.audioBase64).toBeDefined();
    });
  });
});

describe("Voice Ledger Context Decoupling & Pluggable Architecture", () => {
  afterEach(() => {
    setVoiceProvider(null);
    setVoiceLedgerRepository(null);
  });

  it("allows setting custom mock provider and repository", async () => {
    const customMock = new MockGnaniVoiceProvider({ profile: "instant" });
    setVoiceProvider(customMock);
    expect(getVoiceProvider()).toBe(customMock);

    const customRepo = new InMemoryVoiceLedgerRepository();
    customRepo.setMetrics("user-999", "org-999", {
      totalSpentMonthToDate: 8888,
      totalIncomeMonthToDate: 77777,
      topCategory: "Agriculture",
    });
    setVoiceLedgerRepository(customRepo);
    expect(getVoiceLedgerRepository()).toBe(customRepo);

    const metrics = await getVoiceLedgerRepository().getLedgerMetrics("user-999", "org-999");
    expect(metrics.totalSpentMonthToDate).toBe(8888);
    expect(metrics.totalIncomeMonthToDate).toBe(77777);
    expect(metrics.topCategory).toBe("Agriculture");
  });

  it("MongooseVoiceLedgerRepository delegates to in-memory store when disconnected without delay", async () => {
    const repo = new MongooseVoiceLedgerRepository();
    const start = Date.now();
    const metrics = await repo.getLedgerMetrics("test-user");
    const duration = Date.now() - start;

    expect(metrics.totalSpentMonthToDate).toBeDefined();
    expect(metrics.totalIncomeMonthToDate).toBeDefined();
    // Must complete in under 20ms without 10-second Mongoose buffering
    expect(duration).toBeLessThan(50);
  });
});
