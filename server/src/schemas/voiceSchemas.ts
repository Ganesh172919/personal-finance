/**
 * @fileoverview Zod validation schemas for Gnani AI Voice endpoints.
 *
 * Covers:
 * - Speech-to-Text transcription via Prisma v3.0
 * - Text-to-Speech synthesis via Timbre
 * - Spoken financial transaction / expense logging via Evon 30B reasoning
 *
 * @module schemas/voiceSchemas
 */

import { z } from "zod";

export const SUPPORTED_INDIC_LANGUAGES = [
  "auto",
  "hi-IN",    // Hindi
  "hi-en-IN", // Hinglish
  "te-IN",    // Telugu
  "ta-IN",    // Tamil
  "kn-IN",    // Kannada
  "mr-IN",    // Marathi
  "bn-IN",    // Bengali
  "gu-IN",    // Gujarati
  "ml-IN",    // Malayalam
  "pa-IN",    // Punjabi
  "or-IN",    // Odia
  "en-IN",    // Indian English
] as const;

export type SupportedIndicLanguage = (typeof SUPPORTED_INDIC_LANGUAGES)[number];

export const transcribeBodySchema = z.object({
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  codeMixed: z.boolean().default(true),
  mode: z.enum(["transcribe", "code-mix", "verbatim", "transliterate"]).optional(),
  audioBase64: z.string().optional(),
  mimeType: z.string().default("audio/webm"),
});

export const synthesizeBodySchema = z.object({
  text: z.string().trim().min(1, "Text is required").max(4000, "Text cannot exceed 4000 characters"),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("hi-IN"),
  voiceGender: z.enum(["female", "male"]).default("female"),
  speakingRate: z.number().min(0.5).max(2.0).default(1.0),
  pitch: z.number().min(-10).max(10).default(0),
});

export const previewVoiceExpenseBodySchema = z.object({
  transcript: z.string().trim().min(1).max(4000),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
});

export const logExpenseVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  accountId: z.string().trim().optional(),
  currency: z.string().default("INR"),
});

export const queryVoiceBodySchema = z.object({
  query: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  currency: z.string().default("INR"),
});

export const khataVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  currency: z.string().default("INR"),
});

export const leadQualificationVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  currency: z.string().default("INR"),
});

export const disputeVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  currency: z.string().default("INR"),
});

export const analyticsVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  audioDurationSeconds: z.number().optional(),
});

export const assistVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  mode: z.enum(["expense", "query", "khata", "lead", "dispute", "tax", "billing", "schemes", "biometrics"]).optional(),
  currency: z.string().default("INR"),
});

export const taxAdvisorVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  financialYear: z.string().default("2024-25"),
  regimePreference: z.enum(["auto", "new", "old"]).default("auto"),
  currency: z.string().default("INR"),
});

export const billingVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  applyGst: z.boolean().default(true),
  currency: z.string().default("INR"),
});

export const schemesVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  age: z.number().optional(),
  occupation: z.string().trim().optional(),
  gender: z.enum(["male", "female", "other", "any"]).default("any"),
  annualIncome: z.number().optional(),
  state: z.string().trim().optional(),
  currency: z.string().default("INR"),
});

export const biometricsVoiceBodySchema = z.object({
  passphrase: z.string().trim().max(1000).optional(),
  transcript: z.string().trim().max(1000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  userId: z.string().trim().optional(),
  action: z.enum(["verify", "enroll", "stepup_auth", "invoice_sign"]).default("verify"),
  amount: z.number().optional(),
});

export const bpoAuditVoiceBodySchema = z.object({
  transcript: z.string().trim().max(10000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(true),
  agentName: z.string().trim().default("Vikram (Senior Advisor)"),
  customerName: z.string().trim().default("Ramesh Patel"),
  campaignType: z.enum(["inbound_support", "bfsi_collections", "tele_sales", "grievance"]).default("inbound_support"),
  callDurationSeconds: z.number().default(185),
});

export const healthcareVoiceBodySchema = z.object({
  transcript: z.string().trim().max(5000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  patientAge: z.number().optional(),
  patientGender: z.enum(["male", "female", "other"]).optional(),
  hasAyushmanBharat: z.boolean().default(true),
});

export const automotiveVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(true),
  vehicleRegNumber: z.string().trim().optional(),
  fastagBank: z.string().trim().optional(),
});

export const realEstateVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  propertyCostInr: z.number().optional(),
  downpaymentInr: z.number().optional(),
  tenureYears: z.number().default(20),
  city: z.string().trim().optional(),
});

export const hospitalityVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  guestsCount: z.number().default(2),
  checkInDate: z.string().trim().optional(),
  city: z.string().trim().optional(),
  serviceType: z.enum(["hotel_booking", "dining_reservation", "room_service", "travel_guide"]).default("hotel_booking"),
});

export const consumerDurablesVoiceBodySchema = z.object({
  transcript: z.string().trim().max(4000).optional(),
  audioBase64: z.string().optional(),
  language: z.enum(SUPPORTED_INDIC_LANGUAGES).default("auto"),
  telephonic: z.boolean().default(false),
  applianceCategory: z.enum(["refrigerator", "washing_machine", "air_conditioner", "television", "microwave", "general"]).default("general"),
  brand: z.string().trim().optional(),
  issueDescription: z.string().trim().optional(),
  warrantyStatus: z.enum(["in_warranty", "out_of_warranty", "extended_amc"]).default("in_warranty"),
});

export type TranscribeBody = z.infer<typeof transcribeBodySchema>;
export type SynthesizeBody = z.infer<typeof synthesizeBodySchema>;
export type LogExpenseVoiceBody = z.infer<typeof logExpenseVoiceBodySchema>;
export type QueryVoiceBody = z.infer<typeof queryVoiceBodySchema>;
export type KhataVoiceBody = z.infer<typeof khataVoiceBodySchema>;
export type LeadQualificationVoiceBody = z.infer<typeof leadQualificationVoiceBodySchema>;
export type DisputeVoiceBody = z.infer<typeof disputeVoiceBodySchema>;
export type AnalyticsVoiceBody = z.infer<typeof analyticsVoiceBodySchema>;
export type AssistVoiceBody = z.infer<typeof assistVoiceBodySchema>;
export type TaxAdvisorVoiceBody = z.infer<typeof taxAdvisorVoiceBodySchema>;
export type BillingVoiceBody = z.infer<typeof billingVoiceBodySchema>;
export type SchemesVoiceBody = z.infer<typeof schemesVoiceBodySchema>;
export type BiometricsVoiceBody = z.infer<typeof biometricsVoiceBodySchema>;
export type BpoAuditVoiceBody = z.infer<typeof bpoAuditVoiceBodySchema>;
export type HealthcareVoiceBody = z.infer<typeof healthcareVoiceBodySchema>;
export type AutomotiveVoiceBody = z.infer<typeof automotiveVoiceBodySchema>;
export type RealEstateVoiceBody = z.infer<typeof realEstateVoiceBodySchema>;
export type HospitalityVoiceBody = z.infer<typeof hospitalityVoiceBodySchema>;
export type ConsumerDurablesVoiceBody = z.infer<typeof consumerDurablesVoiceBodySchema>;
