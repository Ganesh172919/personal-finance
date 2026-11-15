/**
 * @fileoverview API client for Gnani AI Voice and Indic Speech Services.
 *
 * Implements:
 * - transcribeVoice (Prisma v3.0 STT)
 * - synthesizeVoice (Timbre TTS)
 * - logExpenseVoice (Evon 30B financial reasoning + ledger commit)
 * - getVoiceLanguages
 * - getVoiceStatus
 *
 * @module lib/api/voice
 */

import { apiClient } from "./core";

function appendVoiceRecording(formData: FormData, recording: Blob) {
  const extension = recording.type.startsWith("audio/wav") ? "wav" : "webm";
  formData.append("audio", recording, `recording.${extension}`);
}

export interface IIndicLanguage {
  code: string;
  name: string;
  nativeName: string;
  samplePhrase: string;
}

export interface IGnaniSpeechAnalytics {
  sentiment: {
    label: "Positive" | "Neutral" | "Anxious" | "Urgent";
    confidence: number;
    tone: string;
  };
  acoustics: {
    snrImprovementDb: number;
    detectedEnvironment: string;
    speechRateWpm: number;
    pitchVarianceHz: number;
    silenceRatioPercent: number;
  };
  compliance: {
    rbiFairPracticesPassed: boolean;
    voiceBiometricsMatchScore: number;
    antiSpoofStatus: "authentic_human_liveness_verified" | "unverified";
    debtCollectionCodeVerified?: boolean;
  };
  indicDialectMetrics: {
    codeMixedRatioPercent: number;
    phoneticFidelityScore: number;
    regionName: string;
  };
}

export interface ITranscriptionResponse {
  transcript: string;
  detectedLanguage: string;
  confidence: number;
  model: string;
  telephonicProcessed: boolean;
  provider: "gnani_prisma_v3_live" | "gnani_prisma_v3_fallback";
  durationSeconds?: number;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface ISynthesisResponse {
  audioBase64: string;
  mimeType: string;
  language: string;
  voiceGender: string;
  model: string;
  provider: "gnani_timbre_live" | "gnani_timbre_fallback";
}

export interface IExtractedVoiceExpense {
  amount: number;
  category: string;
  merchantName: string;
  description: string;
  paymentMethod: string;
  type: "expense" | "income" | "investment";
  confidenceScore: number;
  reasoningNotes: string;
  currency: string;
  rawTranscript: string;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IExtractedKhataDebt {
  contactName: string;
  amount: number;
  direction: "lent" | "borrowed" | "collected";
  dueDate?: string;
  note: string;
  currency: string;
  confidenceScore: number;
  reminderSpeech: string;
  audioReminder?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IKhataVoiceResponse {
  khata: IExtractedKhataDebt;
  modelsUsed: {
    stt: string;
    reasoning: string;
    tts: string;
  };
}

export interface ILogExpenseVoiceResponse {
  transaction: any;
  extractedExpense: IExtractedVoiceExpense;
  spokenConfirmation: string;
  audioFeedback: ISynthesisResponse;
  modelsUsed: {
    stt: string;
    reasoning: string;
    tts: string;
  };
}

export interface IQueryVoiceResponse {
  query: string;
  answer: string;
  audioFeedback: ISynthesisResponse;
  financialContext: {
    totalSpentThisMonth: number;
    totalIncomeThisMonth: number;
    topCategory: string;
    transactionCount: number;
    currency: string;
  };
  modelsUsed: {
    stt: string;
    reasoning: string;
    tts: string;
  };
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface ILeadQualificationResult {
  applicantName: string;
  businessName: string;
  businessType: string;
  city: string;
  tierLevel: "Tier-1" | "Tier-2" | "Tier-3" | "Rural";
  monthlyRevenue: number;
  loanAmountRequested: number;
  purpose: string;
  dscrRatio: number;
  estimatedEmi: number;
  tenureMonths: number;
  eligibilityScore: number;
  approvalLikelihood: "High (Instant Pre-Approved)" | "Medium (Document Verification)" | "Underwriter Review Required";
  recommendedScheme: string;
  spokenQualificationText: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface ILeadQualificationVoiceResponse {
  qualification: ILeadQualificationResult;
  modelsUsed: {
    stt: string;
    reasoning: string;
    tts: string;
  };
}

export interface IDisputeResult {
  ticketId: string;
  transactionRef: string;
  disputeType:
    | "UPI_DEBIT_WITHOUT_CREDIT"
    | "MERCHANT_QR_DOUBLE_DEBIT"
    | "ATM_CASH_DISPENSE_FAILURE"
    | "IMPS_NEFT_DELAY"
    | "GENERAL_BILLING_DISPUTE";
  disputedAmount: number;
  currency: string;
  merchantOrBeneficiary: string;
  rbiCircularRef: string;
  mandatedTAT: string;
  compensationRule: string;
  status: "REGISTERED_WITH_NPCI_UDMS" | "IN_ESCROW_REVERSAL" | "OMBUDSMAN_ESCALATED";
  escalationTier: string;
  targetResolutionDate: string;
  explanation: string;
  spokenResolutionText: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IDisputeVoiceResponse {
  dispute: IDisputeResult;
  modelsUsed: {
    stt: string;
    reasoning: string;
    tts: string;
  };
}

export interface IGnaniStatusResponse {
  platform: string;
  challenge: string;
  participant: string;
  status: "configured" | "fallback_active";
  providerMode: "live" | "simulation";
  connectionVerified: boolean;
  telemetrySource: "demo";
  creditsAllocated: number;
  reasoning: {
    model: string;
    status: "configured" | "not_configured";
  };
  models: {
    stt: string;
    tts: string;
    llm: string;
  };
  capabilities: string[];
  languages: IIndicLanguage[];
}

/**
 * Transcribes audio via Gnani Prisma v3.0.
 */
export async function transcribeVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  language?: string;
  telephonic?: boolean;
  codeMixed?: boolean;
}, signal?: AbortSignal): Promise<ITranscriptionResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.codeMixed !== undefined) formData.append("codeMixed", String(params.codeMixed));

    const res = await apiClient<{ success: boolean; data: ITranscriptionResponse }>("/v1/voice/transcribe", {
      method: "POST",
      body: formData,
      signal,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: ITranscriptionResponse }>("/v1/voice/transcribe", {
    method: "POST",
    signal,
    body: JSON.stringify({
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      codeMixed: params.codeMixed !== false,
    }),
  });
  return res.data;
}

/**
 * Synthesizes text to speech using Gnani Timbre TTS.
 */
export async function synthesizeVoice(params: {
  text: string;
  language?: string;
  voiceGender?: "female" | "male";
  speakingRate?: number;
  pitch?: number;
}, signal?: AbortSignal): Promise<ISynthesisResponse> {
  const res = await apiClient<{ success: boolean; data: ISynthesisResponse }>("/v1/voice/synthesize", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
  return res.data;
}

/**
 * Extracts expense via Evon 30B reasoning and commits directly to ledger.
 */
export async function logExpenseVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  accountId?: string;
  currency?: string;
  draftToken?: string;
}): Promise<ILogExpenseVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.accountId) formData.append("accountId", params.accountId);
    if (params.currency) formData.append("currency", params.currency);

    const res = await apiClient<{ success: boolean; data: ILogExpenseVoiceResponse }>("/v1/voice/log-expense", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: ILogExpenseVoiceResponse }>("/v1/voice/log-expense", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      accountId: params.accountId,
      currency: params.currency || "INR",
      draftToken: params.draftToken,
    }),
  });
  return res.data;
}

export async function previewVoiceExpense(transcript: string, language: string) {
  const response = await apiClient<{ success: boolean; data: { expense: IExtractedVoiceExpense; draftToken: string } }>(
    "/v1/voice/expense-preview",
    { method: "POST", body: JSON.stringify({ transcript, language }) },
  );
  return response.data;
}

/**
 * Submits a spoken or textual question to FinWise and receives the answer and Timbre audio.
 */
export async function queryVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  query?: string;
  language?: string;
  telephonic?: boolean;
  currency?: string;
}): Promise<IQueryVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.query) formData.append("query", params.query);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.currency) formData.append("currency", params.currency);

    const res = await apiClient<{ success: boolean; data: IQueryVoiceResponse }>("/v1/voice/query", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IQueryVoiceResponse }>("/v1/voice/query", {
    method: "POST",
    body: JSON.stringify({
      query: params.query,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      currency: params.currency || "INR",
    }),
  });
  return res.data;
}

/**
 * Extracts and logs informal BFSI Collections & Khata debt records from spoken voice
 * using Gnani Evon 30B reasoning and synthesizes payment reminders via Timbre TTS.
 */
export async function logKhataDebtVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  currency?: string;
}): Promise<IKhataVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.currency) formData.append("currency", params.currency);

    const res = await apiClient<{ success: boolean; data: IKhataVoiceResponse }>("/v1/voice/collections", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IKhataVoiceResponse }>("/v1/voice/collections", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      currency: params.currency || "INR",
    }),
  });
  return res.data;
}

/**
 * Evaluates spoken MSME / Kirana loan queries for MUDRA & PM SVANidhi qualification
 * using Gnani Evon 30B reasoning and synthesizes spoken pre-approval decision via Timbre TTS.
 */
export async function qualifyLeadVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  currency?: string;
}): Promise<ILeadQualificationVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.currency) formData.append("currency", params.currency);

    const res = await apiClient<{ success: boolean; data: ILeadQualificationVoiceResponse }>("/v1/voice/lead-qualification", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: ILeadQualificationVoiceResponse }>("/v1/voice/lead-qualification", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      currency: params.currency || "INR",
    }),
  });
  return res.data;
}

/**
 * Submits spoken UPI dispute / grievance queries for automated extraction,
 * NPCI UDMS registration, and RBI Ombudsman T+1 TAT resolution.
 */
export async function resolveDisputeVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  currency?: string;
}): Promise<IDisputeVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.currency) formData.append("currency", params.currency);

    const res = await apiClient<{ success: boolean; data: IDisputeVoiceResponse }>("/v1/voice/dispute", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IDisputeVoiceResponse }>("/v1/voice/dispute", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
      currency: params.currency || "INR",
    }),
  });
  return res.data;
}

/**
 * Retrieves the list of supported Indic languages.
 */
export async function getVoiceLanguages(): Promise<IIndicLanguage[]> {
  const res = await apiClient<{ success: boolean; data: IIndicLanguage[] }>("/v1/voice/languages", {
    method: "GET",
  });
  return res.data;
}

/**
 * Retrieves Gnani AI platform status and credit usage.
 */
export async function getVoiceStatus(): Promise<IGnaniStatusResponse> {
  const res = await apiClient<{ success: boolean; data: IGnaniStatusResponse }>("/v1/voice/status", {
    method: "GET",
  });
  return res.data;
}

export interface IAnalyticsVoiceResponse {
  analytics: IGnaniSpeechAnalytics;
  transcript: string;
  modelsUsed: {
    analytics: string;
    biometrics: string;
    asr: string;
  };
}

/**
 * Analyzes audio / transcript for acoustics, SNR improvement, sentiment, and compliance.
 */
export async function analyzeVoiceSpeech(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
}): Promise<IAnalyticsVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));

    const res = await apiClient<{ success: boolean; data: IAnalyticsVoiceResponse }>("/v1/voice/analytics", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IAnalyticsVoiceResponse }>("/v1/voice/analytics", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: !!params.telephonic,
    }),
  });
  return res.data;
}

export interface IGnaniAssistInsights {
  sessionId: string;
  nextBestAction: {
    actionType: "COLLECT_PAYMENT" | "RECOMMEND_SIP" | "APPROVE_LOAN" | "FILE_DISPUTE" | "BUDGET_ADVICE" | "TAX_OPTIMIZATION" | "ISSUE_INVOICE";
    title: string;
    description: string;
    confidence: number;
    recommendedPrompt: string;
  };
  sentimentCues: {
    currentMood: "Satisfied" | "Cautious" | "Anxious" | "Urgent" | "Confident";
    trend: "improving" | "stable" | "deteriorating";
    empathyGuidance: string;
  };
  battleCard: {
    category: string;
    keyPoints: string[];
    talkingPointsIndic: string;
  };
  complianceCheckpoint: {
    rbiMasterDirection: string;
    fairPracticesVerified: boolean;
    dataProtectionCertified: boolean;
    auditStatus: "PASS" | "NEEDS_DISCLOSURE";
  };
}

export interface IAssistVoiceResponse {
  assist: IGnaniAssistInsights;
  transcript: string;
  modelsUsed: {
    assist: string;
    reasoning: string;
    stt: string;
  };
}

/**
 * Real-time Gnani Assist Co-Pilot: live Next-Best-Action (NBA), dynamic battle cards,
 * and RBI Master Direction compliance verification.
 */
export async function getVoiceAssistInsights(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  mode?: "expense" | "query" | "khata" | "lead" | "dispute" | "tax" | "billing" | "schemes" | "biometrics" | "bpo";
}): Promise<IAssistVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.mode) formData.append("mode", params.mode);

    const res = await apiClient<{ success: boolean; data: IAssistVoiceResponse }>("/v1/voice/assist", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IAssistVoiceResponse }>("/v1/voice/assist", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      mode: params.mode || "expense",
    }),
  });
  return res.data;
}

export interface ITaxSlabDetail {
  slab: string;
  rate: string;
  taxableInSlab: number;
  taxAmount: number;
}

export interface ITaxBreakdown {
  financialYear: string;
  grossIncome: number;
  standardDeduction: number;
  taxableIncome: number;
  slabBreakdown: ITaxSlabDetail[];
  baseTax: number;
  section87ARebate: number;
  netTaxBeforeCess: number;
  cess: number;
  totalTaxLiability: number;
  effectiveTaxRate: number;
  optimalRegime: "new" | "old";
  savingsWithOptimalRegime: number;
  oldRegimeComparison: {
    grossIncome: number;
    standardDeduction: number;
    deductions80C: number;
    deductions80D: number;
    taxableIncome: number;
    totalTaxLiability: number;
  };
  gstCompositionApplicable: boolean;
  gstCompositionTax: number;
}

export interface ITaxAdvisorVoiceResponse {
  transcript: string;
  detectedLanguage: string;
  taxSummary: ITaxBreakdown;
  taxSavingTips: string[];
  spokenAdviceText: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics: IGnaniSpeechAnalytics;
}

export interface IBillingLineItem {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface IBillingInvoiceDocket {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerPhone?: string;
  merchantName: string;
  gstin: string;
  lineItems: IBillingLineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  totalGst: number;
  roundOff: number;
  grandTotal: number;
  upiPaymentUri: string;
  formattedDocket: string;
  spokenSummaryText: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics: IGnaniSpeechAnalytics;
}

/**
 * Spoken Bharat Tax & GST Copilot API.
 */
export async function adviseTaxVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  financialYear?: string;
  regimePreference?: "auto" | "new" | "old";
}): Promise<ITaxAdvisorVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.financialYear) formData.append("financialYear", params.financialYear);
    if (params.regimePreference) formData.append("regimePreference", params.regimePreference);

    const res = await apiClient<{ success: boolean; data: ITaxAdvisorVoiceResponse }>("/v1/voice/tax-advisor", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: ITaxAdvisorVoiceResponse }>("/v1/voice/tax-advisor", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      financialYear: params.financialYear || "2024-25",
      regimePreference: params.regimePreference || "auto",
    }),
  });
  return res.data;
}

/**
 * Autonomous Spoken Vyapar Billing & GST Invoice API.
 */
export async function generateBillingVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  customerName?: string;
  customerPhone?: string;
  applyGst?: boolean;
}): Promise<IBillingInvoiceDocket> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.customerName) formData.append("customerName", params.customerName);
    if (params.customerPhone) formData.append("customerPhone", params.customerPhone);
    if (params.applyGst !== undefined) formData.append("applyGst", String(params.applyGst));

    const res = await apiClient<{ success: boolean; data: IBillingInvoiceDocket }>("/v1/voice/billing", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IBillingInvoiceDocket }>("/v1/voice/billing", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      applyGst: params.applyGst !== false,
    }),
  });
  return res.data;
}

export interface ISchemeRecommendation {
  schemeId: string;
  schemeName: string;
  shortCode: string;
  ministry: string;
  matchScorePercent: number;
  benefitSummary: string;
  benefitAmountInr: number;
  eligibilityCriteria: string[];
  requiredDocuments: string[];
  applicationPortal: string;
  portalUrl: string;
  category: "credit" | "income_support" | "health" | "pension" | "girl_child";
}

export interface IVoiceSchemesResponse {
  transcript: string;
  language: string;
  detectedProfile: {
    occupation: string;
    annualIncome: number;
    age?: number;
    gender?: string;
    landholdingAcres?: number;
    isStreetVendor: boolean;
    isFarmer: boolean;
    hasGirlChild: boolean;
  };
  eligibleSchemes: ISchemeRecommendation[];
  topRecommendation: ISchemeRecommendation;
  spokenGuidance: string;
  applicationGuidanceDocket: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IVoiceBiometricsResponse {
  verified: boolean;
  speakerId: string;
  action: string;
  confidenceScore: number;
  antiSpoofScore: number;
  livenessStatus: "GENUINE_LIVE_HUMAN" | "SPOOF_PLAYBACK_REJECTED" | "SUSPICIOUS_SYNTHESIS";
  spectralAcoustics: {
    formantF1Hz: number;
    formantF2Hz: number;
    pitchFundamentalHz: number;
    jitterPercent: number;
    shimmerPercent: number;
    acousticMatchRatio: number;
  };
  authorizationToken?: string;
  tokenExpirySeconds: number;
  thresholdExceeded: boolean;
  statusMessage: string;
  spokenFeedback: string;
  audioFeedback?: ISynthesisResponse;
}

/**
 * Spoken Jan Kalyan Government Schemes Voice Navigator API.
 */
export async function evaluateGovernmentSchemesVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  age?: number;
  annualIncome?: number;
  occupation?: string;
  gender?: string;
}): Promise<IVoiceSchemesResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.age) formData.append("age", String(params.age));
    if (params.annualIncome) formData.append("annualIncome", String(params.annualIncome));
    if (params.occupation) formData.append("occupation", params.occupation);
    if (params.gender) formData.append("gender", params.gender);

    const res = await apiClient<{ success: boolean; data: IVoiceSchemesResponse }>("/v1/voice/schemes", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IVoiceSchemesResponse }>("/v1/voice/schemes", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      age: params.age,
      annualIncome: params.annualIncome,
      occupation: params.occupation,
      gender: params.gender,
    }),
  });
  return res.data;
}

/**
 * Dedicated Voice Biometrics & Liveness Authentication Shield API.
 */
export async function verifyVoiceBiometrics(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  passphrase?: string;
  transcript?: string;
  language?: string;
  action?: "verify" | "enroll" | "stepup_auth" | "invoice_sign";
  amount?: number;
}): Promise<IVoiceBiometricsResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.passphrase) formData.append("passphrase", params.passphrase);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.action) formData.append("action", params.action);
    if (params.amount !== undefined) formData.append("amount", String(params.amount));

    const res = await apiClient<{ success: boolean; data: IVoiceBiometricsResponse }>("/v1/voice/biometrics/verify", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IVoiceBiometricsResponse }>("/v1/voice/biometrics/verify", {
    method: "POST",
    body: JSON.stringify({
      passphrase: params.passphrase,
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      action: params.action || "verify",
      amount: params.amount,
    }),
  });
  return res.data;
}

export interface IComplianceCheckResult {
  checkpointId: string;
  title: string;
  category: "GREETING" | "VERIFICATION" | "EMPATHY" | "RESOLUTION" | "COMPLIANCE" | "CLOSING";
  status: "PASS" | "FAIL" | "PARTIAL";
  weightScore: number;
  scoreAchieved: number;
  observedSnippet: string;
  recommendation?: string;
}

export interface IBpoAuditVoiceResponse {
  callId: string;
  agentName: string;
  customerName: string;
  campaignType: string;
  callDurationSeconds: number;
  agentQualityScore: number;
  performanceTier: "EXEMPLARY" | "COMPLIANT" | "NEEDS_COACHING" | "CRITICAL_NON_COMPLIANCE";
  complianceChecks: IComplianceCheckResult[];
  compliancePassRate: number;
  sentimentJourney: {
    start: { label: string; score: number };
    mid: { label: string; score: number };
    end: { label: string; score: number };
    trajectory: "SIGNIFICANT_IMPROVEMENT" | "CONSISTENTLY_POSITIVE" | "ESCALATED_FRUSTRATION";
    sentimentTurnaroundScore: number;
  };
  speechAcoustics: {
    talkTimeAgentPercent: number;
    listenTimeCustomerPercent: number;
    deadAirDurationSeconds: number;
    deadAirRatioPercent: number;
    interruptionCount: number;
    averageSpeechRateWpm: number;
    snrQualityDb: number;
  };
  coachingFeedback: {
    strengths: string[];
    improvementOpportunities: string[];
    supervisorActionItems: string[];
  };
  spokenCoachingDebrief: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IHealthcareVoiceResponse {
  intakeId: string;
  transcript: string;
  detectedLanguage: string;
  patientProfile: {
    age: number;
    gender: string;
    hasAyushmanBharat: boolean;
  };
  clinicalVitals: {
    suspectedCondition: string;
    icd10Code: string;
    severity: string;
    triageCategory: string;
    chiefComplaints: string[];
    recommendedTests: string[];
    carePlan: string[];
  };
  pmjayCoverage: {
    schemeName: string;
    annualWalletLimitInr: number;
    coverageStatus: string;
    empanelledHospitalPreAuth: string;
    cashlessPackageApplicable: string;
    goldenCardVerified: boolean;
    nearestEmpanelledClinic: string;
  };
  spokenResponse: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IRealEstateVoiceResponse {
  docketId: string;
  transcript: string;
  detectedLanguage: string;
  propertyOverview: {
    city: string;
    propertyCostInr: number;
    downpaymentInr: number;
    loanPrincipalInr: number;
    tenureYears: number;
    annualInterestRatePercent: number;
  };
  loanCalculations: {
    monthlyEmiInr: number;
    totalInterestPayableInr: number;
    totalPaymentOverTenureInr: number;
    stampDutyAndRegistration: {
      stampDutyPercent: number;
      stampDutyAmountInr: number;
      registrationFeePercent: number;
      registrationFeeAmountInr: number;
      totalLegalRegistrationInr: number;
    };
  };
  pmaySubsidy: {
    schemeName: string;
    eligibilityStatus: string;
    interestSubsidyAmountInr: number;
    effectiveLoanAfterSubsidyInr: number;
    adjustedMonthlyEmi: number;
    directBenefitTransferPortal: string;
  };
  spokenResponse: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IAutomotiveVoiceResponse {
  commandId: string;
  transcript: string;
  detectedLanguage: string;
  inCabinAcousticTelemetry: {
    roadCabinNoiseFloorDb: number;
    prismaDspFilterGainDb: number;
    speechIntelligibilityIndex: number;
    windTurbulenceSuppression: string;
  };
  actionExecuted: {
    service: string;
    vehicleNumber: string;
    fastagBank: string;
    rechargeAmountInr: number;
    newFastagBalanceInr: number;
    transactionRef: string;
    nextTollPlaza: string;
    distanceToTollKm: number;
    tollChargeInr: number;
    vehicleHealth: {
      engineBatteryHealth: string;
      tirePressurePsi: { frontLeft: number; frontRight: number; rearLeft: number; rearRight: number };
      fuelRangeRemainingKm: number;
    };
  };
  spokenResponse: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IHospitalityVoiceResponse {
  bookingId: string;
  transcript: string;
  detectedLanguage: string;
  reservationDocket: {
    bookingId: string;
    propertyOrRestaurantName: string;
    location: string;
    serviceType: string;
    checkInDate: string;
    numberOfGuests: number;
    roomCategory: string;
    nightlyRateInr: number;
    durationNights: number;
    diningReservation: {
      restaurantName: string;
      tableType: string;
      cuisine: string;
      timeSlot: string;
      coverChargeInr: number;
    };
    billingSummary: {
      baseAccommodationInr: number;
      diningEstimateInr: number;
      gstPercent: number;
      gstAmountInr: number;
      grandTotalInr: number;
      cancellationPolicy: string;
    };
    amenitiesIncluded: string[];
  };
  spokenResponse: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

export interface IConsumerDurablesVoiceResponse {
  ticketId: string;
  transcript: string;
  detectedLanguage: string;
  supportTicket: {
    ticketId: string;
    applianceCategory: string;
    brand: string;
    modelDetected: string;
    reportedFault: string;
    diagnosticTriage: string;
    warrantyAssessment: {
      status: string;
      pcbCompressorWarrantyTenure: string;
      laborAndGasCharges: string;
      isCoveredUnderFreeService: boolean;
    };
    technicianDispatch: {
      allocatedServiceCenter: string;
      scheduledSlot: string;
      technicianName: string;
      contactNumber: string;
      otpRequiredForCompletion: string;
    };
    selfCareSafetyChecklist: string[];
  };
  spokenResponse: string;
  audioFeedback?: ISynthesisResponse;
  speechAnalytics?: IGnaniSpeechAnalytics;
}

/**
 * Autonomous BPO & Contact Center 100% Call QA Auditing & Agent Scoring API (Gnani Aura).
 */
export async function auditBpoCallVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  agentName?: string;
  customerName?: string;
  campaignType?: "inbound_support" | "bfsi_collections" | "tele_sales" | "grievance";
  telephonic?: boolean;
  callDurationSeconds?: number;
}): Promise<IBpoAuditVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.agentName) formData.append("agentName", params.agentName);
    if (params.customerName) formData.append("customerName", params.customerName);
    if (params.campaignType) formData.append("campaignType", params.campaignType);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.callDurationSeconds) formData.append("callDurationSeconds", String(params.callDurationSeconds));

    const res = await apiClient<{ success: boolean; data: IBpoAuditVoiceResponse }>("/v1/voice/bpo-audit", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IBpoAuditVoiceResponse }>("/v1/voice/bpo-audit", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      agentName: params.agentName,
      customerName: params.customerName,
      campaignType: params.campaignType,
      telephonic: params.telephonic,
      callDurationSeconds: params.callDurationSeconds,
    }),
  });
  return res.data;
}

/**
 * Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY Voice Copilot.
 */
export async function intakeHealthcareVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  patientAge?: number;
  patientGender?: "male" | "female" | "other";
  hasAyushmanBharat?: boolean;
}): Promise<IHealthcareVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.patientAge) formData.append("patientAge", String(params.patientAge));
    if (params.patientGender) formData.append("patientGender", params.patientGender);
    if (params.hasAyushmanBharat !== undefined) formData.append("hasAyushmanBharat", String(params.hasAyushmanBharat));

    const res = await apiClient<{ success: boolean; data: IHealthcareVoiceResponse }>("/v1/voice/healthcare", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IHealthcareVoiceResponse }>("/v1/voice/healthcare", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: params.telephonic,
      patientAge: params.patientAge,
      patientGender: params.patientGender,
      hasAyushmanBharat: params.hasAyushmanBharat,
    }),
  });
  return res.data;
}

/**
 * Connected Automobile In-Cabin Voice & FASTag / Telematics Copilot.
 */
export async function executeAutomotiveVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  vehicleRegNumber?: string;
  fastagBank?: string;
}): Promise<IAutomotiveVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.vehicleRegNumber) formData.append("vehicleRegNumber", params.vehicleRegNumber);
    if (params.fastagBank) formData.append("fastagBank", params.fastagBank);

    const res = await apiClient<{ success: boolean; data: IAutomotiveVoiceResponse }>("/v1/voice/automotive", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IAutomotiveVoiceResponse }>("/v1/voice/automotive", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: params.telephonic,
      vehicleRegNumber: params.vehicleRegNumber,
      fastagBank: params.fastagBank,
    }),
  });
  return res.data;
}

/**
 * Real Estate Spoken Property EMI & PMAY Housing Subsidy Voice Copilot.
 */
export async function calculateRealEstateVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  propertyCostInr?: number;
  downpaymentInr?: number;
  tenureYears?: number;
  city?: string;
}): Promise<IRealEstateVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.propertyCostInr) formData.append("propertyCostInr", String(params.propertyCostInr));
    if (params.downpaymentInr) formData.append("downpaymentInr", String(params.downpaymentInr));
    if (params.tenureYears) formData.append("tenureYears", String(params.tenureYears));
    if (params.city) formData.append("city", params.city);

    const res = await apiClient<{ success: boolean; data: IRealEstateVoiceResponse }>("/v1/voice/real-estate", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IRealEstateVoiceResponse }>("/v1/voice/real-estate", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: params.telephonic,
      propertyCostInr: params.propertyCostInr,
      downpaymentInr: params.downpaymentInr,
      tenureYears: params.tenureYears,
      city: params.city,
    }),
  });
  return res.data;
}

/**
 * Hospitality Spoken Concierge & Dining/Hotel Reservation Copilot.
 */
export async function bookHospitalityVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  guestsCount?: number;
  checkInDate?: string;
  city?: string;
  serviceType?: "hotel_booking" | "dining_reservation" | "room_service" | "travel_guide";
}): Promise<IHospitalityVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.guestsCount) formData.append("guestsCount", String(params.guestsCount));
    if (params.checkInDate) formData.append("checkInDate", params.checkInDate);
    if (params.city) formData.append("city", params.city);
    if (params.serviceType) formData.append("serviceType", params.serviceType);

    const res = await apiClient<{ success: boolean; data: IHospitalityVoiceResponse }>("/v1/voice/hospitality", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IHospitalityVoiceResponse }>("/v1/voice/hospitality", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: params.telephonic,
      guestsCount: params.guestsCount,
      checkInDate: params.checkInDate,
      city: params.city,
      serviceType: params.serviceType,
    }),
  });
  return res.data;
}

/**
 * Consumer Durables Spoken Warranty, AMC & Appliance Support Desk.
 */
export async function supportConsumerDurablesVoice(params: {
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  language?: string;
  telephonic?: boolean;
  applianceCategory?: "refrigerator" | "washing_machine" | "air_conditioner" | "television" | "microwave" | "general";
  brand?: string;
  issueDescription?: string;
  warrantyStatus?: "in_warranty" | "out_of_warranty" | "extended_amc";
}): Promise<IConsumerDurablesVoiceResponse> {
  if (params.audioBlob) {
    const formData = new FormData();
    appendVoiceRecording(formData, params.audioBlob);
    if (params.transcript) formData.append("transcript", params.transcript);
    if (params.language) formData.append("language", params.language);
    if (params.telephonic !== undefined) formData.append("telephonic", String(params.telephonic));
    if (params.applianceCategory) formData.append("applianceCategory", params.applianceCategory);
    if (params.brand) formData.append("brand", params.brand);
    if (params.issueDescription) formData.append("issueDescription", params.issueDescription);
    if (params.warrantyStatus) formData.append("warrantyStatus", params.warrantyStatus);

    const res = await apiClient<{ success: boolean; data: IConsumerDurablesVoiceResponse }>("/v1/voice/consumer-durables", {
      method: "POST",
      body: formData,
    });
    return res.data;
  }

  const res = await apiClient<{ success: boolean; data: IConsumerDurablesVoiceResponse }>("/v1/voice/consumer-durables", {
    method: "POST",
    body: JSON.stringify({
      transcript: params.transcript,
      audioBase64: params.audioBase64,
      language: params.language || "auto",
      telephonic: params.telephonic,
      applianceCategory: params.applianceCategory,
      brand: params.brand,
      issueDescription: params.issueDescription,
      warrantyStatus: params.warrantyStatus,
    }),
  });
  return res.data;
}
