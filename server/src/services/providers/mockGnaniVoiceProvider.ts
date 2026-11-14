/**
 * @fileoverview High-Fidelity Deterministic Offline Mock Voice Provider.
 *
 * Implements IGnaniVoiceProvider with:
 * 1. Mathematical 16kHz linear PCM chime WAV generator (~25.6KB, 800ms) with dual chords and ADSR decay.
 * 2. Deterministic Indic NLU multi-script normalizer and extraction engine (Devanagari, Bengali, Telugu,
 *    Tamil, Kannada, Gujarati, Odia, Gurmukhi numerals + rural agriculture & mandi presets).
 * 3. Multi-profile simulation engine:
 *    - instant (0ms delay for unit tests and CI)
 *    - realistic_latency (550ms total ± 15% jitter: STT 180ms, Evon 220ms, TTS 150ms)
 *    - chaos_error (429/503/504 fault injection)
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/mockGnaniVoiceProvider
 */

import { generatePcmChimeWav } from "./pcmChimeGenerator";
import {
  IGnaniVoiceProvider,
  VoiceTranscriptionOptions,
  VoiceTranscriptionResult,
  VoiceSynthesisOptions,
  VoiceSynthesisResult,
  VoiceExpenseExtractionResult,
  SimulationProfile,
  GnaniRateLimitError,
  GnaniServiceUnavailableError,
  GnaniTimeoutError,
  GnaniAudioDecodeError,
} from "./gnaniProvider.interface";
import {
  INDIC_LANGUAGES,
  analyzeSpeechAcoustics,
  type GnaniSpeechAnalytics,
} from "../gnaniVoiceService";

export interface MockProviderOptions {
  profile?: SimulationProfile;
  chaosErrorRate?: number;
}

const lakhUnits = "lakhs?|lacs?|laksha";
const thousandUnits = "hazaar|hazar|thousand|aayiram|saavira|veylu";
const hundredUnits = "so|sau|hundred|nooru|vandalu|sho";
const amountUnits = `${lakhUnits}|${thousandUnits}|${hundredUnits}`;
const amountWithUnit = `(-?\\d+(?:,\\d+)*(?:\\.\\d+)?)(?:\\s*(${amountUnits})\\b)?`;
const currencyWord =
  "(?:₹|rs\\.?|inr|rupees?|rupaye?|takas?|roobai|tankara|rupayi|petti|రూపాయలు|रुपये|रुपए|रुपया|টাকা|ರೂಪಾಯಿ|ரூபாய்)";
const hindiWholeAmounts = new Map(Object.entries({
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100,
}));
// Match the entire amount after the spending phrase so a compound such as "एक सौ पचास"
// can never be recorded as only the trailing "पचास".
const hindiWholeRupees = new RegExp(
  `(^\\s*|\\s(?:पर|में|मैंने|के लिए)\\s+)(${[...hindiWholeAmounts.keys()].join("|")})(?=\\s+(?:रुपये|रुपए|रुपया)(?:[\\s।,.!?]|$))`,
  "u",
);
const amountPatterns = [
  new RegExp(`${currencyWord}\\s*${amountWithUnit}`, "i"),
  new RegExp(`${amountWithUnit}\\s*${currencyWord}`, "i"),
  new RegExp(`(?<![\\w.,-])${amountWithUnit}(?![\\w,])`, "i"),
];

function parseIndicAmount(normalizedText: string): number {
  const fractionPattern = new RegExp(`\\b(dedh|derh|dhai)(?=\\s+(?:${amountUnits})\\b)`, "g");
  const text = normalizedText
    .replace(fractionPattern, (_, word) => word === "dhai" ? "2.5" : "1.5")
    .replace(hindiWholeRupees, (_, prefix, word) => `${prefix}${hindiWholeAmounts.get(word)}`);
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    const unit = match[2];
    if (!unit) return amount;
    if (new RegExp(`^(?:${lakhUnits})$`).test(unit)) return amount * 100_000;
    if (new RegExp(`^(?:${thousandUnits})$`).test(unit)) return amount * 1_000;
    return amount * 100;
  }
  return 0;
}

export class MockGnaniVoiceProvider implements IGnaniVoiceProvider {
  public readonly providerName = "mock_gnani_engine";
  private profile: SimulationProfile = "instant";
  private chaosErrorRate: number = 0.25;

  constructor(options?: MockProviderOptions) {
    if (options?.profile) {
      this.profile = options.profile;
    } else if (process.env.GNANI_SIMULATION_PROFILE) {
      this.profile = process.env.GNANI_SIMULATION_PROFILE as SimulationProfile;
    } else if (process.env.NODE_ENV === "test") {
      this.profile = "instant";
    }
    if (options?.chaosErrorRate !== undefined) {
      this.chaosErrorRate = options.chaosErrorRate;
    }
  }

  public getSimulationProfile(): SimulationProfile {
    return this.profile;
  }

  public setSimulationProfile(profile: SimulationProfile): void {
    this.profile = profile;
  }

  public setChaosErrorRate(rate: number): void {
    this.chaosErrorRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Applies latency or throws chaos error depending on active simulation profile.
   */
  private async applySimulation(
    operationType: "stt" | "evon" | "tts",
    inputContext: string = ""
  ): Promise<void> {
    // 1. Chaos error injection profile
    if (this.profile === "chaos_error") {
      const text = inputContext.toUpperCase();
      if (text.includes("[CHAOS_429]")) {
        throw new GnaniRateLimitError();
      }
      if (text.includes("[CHAOS_503]")) {
        throw new GnaniServiceUnavailableError();
      }
      if (text.includes("[CHAOS_TIMEOUT]")) {
        throw new GnaniTimeoutError();
      }
      if (text.includes("[CHAOS_CORRUPT]")) {
        throw new GnaniAudioDecodeError();
      }

      if (Math.random() < this.chaosErrorRate) {
        const rand = Math.random();
        if (rand < 0.34) {
          throw new GnaniRateLimitError();
        } else if (rand < 0.67) {
          throw new GnaniServiceUnavailableError();
        } else {
          throw new GnaniTimeoutError();
        }
      }
    }

    // 2. Realistic latency profile
    if (this.profile === "realistic_latency") {
      let baseDelay = 180; // STT
      if (operationType === "evon") baseDelay = 220;
      if (operationType === "tts") baseDelay = 150;

      // ± 15% random jitter
      const jitterFactor = 1 + (Math.random() * 0.30 - 0.15);
      const totalDelay = Math.round(baseDelay * jitterFactor);
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }

  /**
   * Deterministic audio transcription for 12 Indic dialects.
   */
  async transcribeAudio(
    buffer?: Buffer,
    options?: VoiceTranscriptionOptions
  ): Promise<VoiceTranscriptionResult> {
    const targetLanguage = options?.language && options.language !== "auto" ? options.language : "hi-IN";
    await this.applySimulation("stt", targetLanguage);

    const sampleMatch = INDIC_LANGUAGES.find((l) => l.code === targetLanguage) || INDIC_LANGUAGES[0];
    const noiseTag = options?.telephonic ? " [Telephonic 8kHz Filtered]" : "";
    const transcript = sampleMatch.samplePhrase;
    const durationSeconds = 3.4;

    const speechAnalytics = analyzeSpeechAcoustics({
      transcript,
      language: targetLanguage,
      telephonic: options?.telephonic,
      audioDurationSeconds: durationSeconds,
    });

    return {
      transcript,
      detectedLanguage: targetLanguage,
      confidence: 0.96,
      model: "Prisma v3.0 (STT)" + noiseTag,
      telephonicProcessed: !!options?.telephonic,
      provider: "gnani_prisma_v3_fallback",
      durationSeconds,
      speechAnalytics,
    };
  }

  /**
   * Synthesizes authentic audible 16kHz PCM audio chime confirmations.
   */
  async synthesizeSpeech(
    text: string,
    options?: VoiceSynthesisOptions
  ): Promise<VoiceSynthesisResult> {
    await this.applySimulation("tts", text);

    const language = options?.language || "hi-IN";
    const voiceGender = options?.voiceGender || options?.gender || "female";
    const durationSeconds = 0.8;

    // Generate genuine 16kHz linear PCM chime WAV (~25.6 KB)
    const audioBuffer = generatePcmChimeWav(durationSeconds);
    const audioBase64 = audioBuffer.toString("base64");

    return {
      audioBuffer,
      audioBase64,
      contentType: "audio/wav",
      mimeType: "audio/wav",
      durationMs: Math.round(durationSeconds * 1000),
      language,
      voiceGender,
      model: "Timbre (TTS, beta)",
      provider: "gnani_timbre_fallback",
    };
  }

  /**
   * Indic NLU transaction parameter extraction from spoken transcripts.
   */
  async extractExpense(
    transcript: string,
    options?: { language?: string; currency?: string }
  ): Promise<VoiceExpenseExtractionResult> {
    await this.applySimulation("evon", transcript);
    const currency = options?.currency || "INR";
    return this.parseIndicTranscriptDeterministic(transcript, currency);
  }

  /**
   * Converts native Indic digits from Devanagari, Bengali, Telugu, Tamil,
   * Kannada, Gujarati, Odia, Gurmukhi, and Malayalam into standard ASCII digits '0'-'9'.
   */
  public normalizeIndicNumerals(input: string): string {
    const indicDigitMap: Record<string, string> = {
      // Devanagari (० - ९)
      "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
      "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
      // Bengali (০ - ৯)
      "\u09E6": "0", "\u09E7": "1", "\u09E8": "2", "\u09E9": "3", "\u09EA": "4",
      "\u09EB": "5", "\u09EC": "6", "\u09ED": "7", "\u09EE": "8", "\u09EF": "9",
      // Telugu (౦ - ౯)
      "\u0C66": "0", "\u0C67": "1", "\u0C68": "2", "\u0C69": "3", "\u0C6A": "4",
      "\u0C6B": "5", "\u0C6C": "6", "\u0C6D": "7", "\u0C6E": "8", "\u0C6F": "9",
      // Tamil (௦ - ௯)
      "\u0BE6": "0", "\u0BE7": "1", "\u0BE8": "2", "\u0BE9": "3", "\u0BEA": "4",
      "\u0BEB": "5", "\u0BEC": "6", "\u0BED": "7", "\u0BEE": "8", "\u0BEF": "9",
      // Kannada (೦ - ೯)
      "\u0CE6": "0", "\u0CE7": "1", "\u0CE8": "2", "\u0CE9": "3", "\u0CEA": "4",
      "\u0CEB": "5", "\u0CEC": "6", "\u0CED": "7", "\u0CEE": "8", "\u0CEF": "9",
      // Gujarati (૦ - ૯)
      "\u0AE6": "0", "\u0AE7": "1", "\u0AE8": "2", "\u0AE9": "3", "\u0AEA": "4",
      "\u0AEB": "5", "\u0AEC": "6", "\u0AED": "7", "\u0AEE": "8", "\u0AEF": "9",
      // Odia (୦ - ୯)
      "\u0B66": "0", "\u0B67": "1", "\u0B68": "2", "\u0B69": "3", "\u0B6A": "4",
      "\u0B6B": "5", "\u0B6C": "6", "\u0B6D": "7", "\u0B6E": "8", "\u0B6F": "9",
      // Gurmukhi (੦ - ੯)
      "\u0A66": "0", "\u0A67": "1", "\u0A68": "2", "\u0A69": "3", "\u0A6A": "4",
      "\u0A6B": "5", "\u0A6C": "6", "\u0A6D": "7", "\u0A6E": "8", "\u0A6F": "9",
      // Malayalam (൦ - ൯)
      "\u0D66": "0", "\u0D67": "1", "\u0D68": "2", "\u0D69": "3", "\u0D6A": "4",
      "\u0D6B": "5", "\u0D6C": "6", "\u0D6D": "7", "\u0D6E": "8", "\u0D6F": "9",
    };

    return input.replace(/[\u0966-\u096F\u09E6-\u09EF\u0C66-\u0C6F\u0BE6-\u0BEF\u0CE6-\u0CEF\u0AE6-\u0AEF\u0B66-\u0B6F\u0A66-\u0A6F\u0D66-\u0D6F]/g, (char) => {
      return indicDigitMap[char] || char;
    });
  }

  public extractIndicAmount(input: string): number {
    return parseIndicAmount(this.normalizeIndicNumerals(input).toLowerCase());
  }

  /**
   * Deterministic Indic financial NLU parser with multi-lingual rules,
   * numeral normalizer, and rural economy presets.
   */
  public parseIndicTranscriptDeterministic(
    transcript: string,
    currency: string = "INR"
  ): VoiceExpenseExtractionResult {
    // First normalize all native Indic script numerals to ASCII digits
    const normalizedText = this.normalizeIndicNumerals(transcript);
    const text = normalizedText.toLowerCase();

    // 1. Amount Extraction (handles digits, k/lakhs, Hindi/Telugu/Tamil numbers)
    const amount = parseIndicAmount(text);

    // 2. Category, Sub-Category & Merchant Recognition
    let category = "General";
    let subCategory: string | undefined = undefined;
    let merchantName = "Direct Expense";
    let type: "expense" | "income" | "investment" = "expense";

    // 2.1 Investment
    if (
      text.includes("gold") ||
      text.includes("jewel") ||
      text.includes("sip") ||
      text.includes("mutual fund") ||
      text.includes("stock") ||
      text.includes("सोना") ||
      text.includes("चांदी") ||
      text.includes("गोल्ड") ||
      text.includes("గోల్డ్") ||
      text.includes("బంగారం") ||
      text.includes("தங்கம்") ||
      text.includes("நகை") ||
      text.includes("সোনা") ||
      text.includes("গয়না") ||
      text.includes("ಚಿನ್ನ")
    ) {
      category = "Investment";
      type = "investment";
      subCategory = "Precious Metals & Securities";
      if (text.includes("kalyan") || text.includes("कल्याण") || text.includes("కళ్యాణ్") || text.includes("கல்யாண்")) {
        merchantName = "Kalyan Jewellers";
      } else if (text.includes("tanishq") || text.includes("तनिष्क")) {
        merchantName = "Tanishq Jewellers";
      } else {
        merchantName = "Gold & Investment Purchase";
      }
    }
    // 2.2 Food & Dining (Evaluate first for tea/snacks/dining)
    else if (
      text.includes("swiggy") ||
      text.includes("zomato") ||
      text.includes("lunch") ||
      text.includes("dinner") ||
      text.includes("food") ||
      text.includes("hotel") ||
      text.includes("samosa") ||
      text.includes("tiffin") ||
      text.includes("oota") ||
      text.includes("saappadu") ||
      text.includes("dhaba") ||
      text.includes("नाश्ता") ||
      text.includes("खाना") ||
      text.includes("होटल") ||
      text.includes("భోజనం") ||
      text.includes("టిఫిన్") ||
      text.includes("சாப்பாடு") ||
      text.includes("খাবার") ||
      text.includes("चায়ের") ||
      /(?:^|\s)(?:tea|chai|vadai|चाय|டீ|టీ|চা)(?:\s|[,\.?!-]|$)/i.test(text)
    ) {
      category = "Food & Dining";
      if (text.includes("swiggy")) {
        merchantName = "Swiggy";
        subCategory = "Online Delivery";
      } else if (text.includes("zomato")) {
        merchantName = "Zomato";
        subCategory = "Online Delivery";
      } else if (
        text.includes("vadai") ||
        text.includes("चায়ের") ||
        /(?:^|\s)(?:tea|chai|vadai|चाय|டீ|టీ|চা)(?:\s|[,\.?!-]|$)/i.test(text)
      ) {
        merchantName = text.includes("kadai") || text.includes("கடை") ? "Tea Kadai" : "Tea Stall & Snacks";
        subCategory = "Chai Tapri & Street Food";
      } else {
        merchantName = "Restaurant & Dining";
        subCategory = "Dine-in";
      }
    }
    // 2.3 Rural Agriculture & Mandi Presets
    else if (
      text.includes("tractor") ||
      text.includes("fertilizer") ||
      text.includes("khad") ||
      text.includes("खाद") ||
      text.includes("beej") ||
      text.includes("बीज") ||
      text.includes("mandi") ||
      text.includes("मंडी") ||
      text.includes("eruvulu") ||
      text.includes("gobbera") ||
      text.includes("fasal") ||
      text.includes("panta") ||
      text.includes("vivasayam") ||
      text.includes("krishi") ||
      text.includes("urea") ||
      text.includes("kisan") ||
      text.includes("किसान") ||
      text.includes("ఎరువులు") ||
      text.includes("మండి") ||
      text.includes("விவசாயம்")
    ) {
      if (text.includes("diesel") || text.includes("tractor")) {
        category = "Transport";
        subCategory = "Tractor & Farm Machinery Fuel";
        merchantName = "Rural Fuel Station / Kisan Kendra";
      } else {
        category = "Agriculture & Rural Livelihood";
        subCategory = text.includes("khad") || text.includes("fertilizer") || text.includes("खाद")
          ? "Fertilizers & Agro-chemicals"
          : "Seeds & Mandi Trading";
        merchantName = "Krishi Upaj Mandi";
      }
    }
    // 2.4 Groceries & Kirana
    else if (
      text.includes("rashan") ||
      text.includes("राशन") ||
      text.includes("kirana") ||
      text.includes("किराना") ||
      /\bgrocer(?:y|ies)\b/.test(text) ||
      text.includes("dukan") ||
      text.includes("दुकान") ||
      text.includes("shop") ||
      text.includes("provision") ||
      text.includes("tarakari") ||
      text.includes("chal") ||
      text.includes("চাল") ||
      text.includes("dal") ||
      text.includes("ডাল") ||
      text.includes("doodh") ||
      text.includes("दूध") ||
      text.includes("paal") ||
      text.includes("பால்") ||
      text.includes("দুধ") ||
      text.includes("পాలు") ||
      text.includes("maligai") ||
      text.includes("மளிகை") ||
      text.includes("sarukulu") ||
      text.includes("సరుకులు") ||
      text.includes("angadi") ||
      text.includes("అంగడి") ||
      text.includes("supermarket") ||
      text.includes("mudir") ||
      text.includes("মুদির") ||
      text.includes("দোকান") ||
      text.includes("blinkit") ||
      text.includes("zepto") ||
      text.includes("instamart")
    ) {
      category = "Groceries";
      subCategory = "Daily Essentials & Staples";
      if (text.includes("sharma") || text.includes("शर्मा")) {
        merchantName = "Sharma Ji Kirana Store";
      } else if (text.includes("mudir") || text.includes("মুদির")) {
        merchantName = "Mudir Dokan";
      } else if (text.includes("supermarket")) {
        merchantName = "Local Supermarket";
      } else {
        merchantName = "Local Kirana & Provisions";
      }
    }
    // 2.5 Transport
    else if (
      text.includes("auto") ||
      text.includes("cab") ||
      text.includes("uber") ||
      text.includes("ola") ||
      text.includes("petrol") ||
      text.includes("diesel") ||
      text.includes("bus") ||
      text.includes("fastag")
    ) {
      category = "Transport";
      subCategory = "Local Transit & Fuel";
      if (text.includes("uber")) merchantName = "Uber India";
      else if (text.includes("ola")) merchantName = "Ola Cabs";
      else if (text.includes("petrol") || text.includes("diesel")) merchantName = "Petrol Pump";
      else merchantName = "Auto / Local Transit";
    }
    // 2.6 Utilities
    else if (
      text.includes("bijli") ||
      text.includes("बिजली") ||
      text.includes("electricity") ||
      text.includes("water") ||
      text.includes("bill") ||
      text.includes("recharge") ||
      text.includes("wifi") ||
      text.includes("lpg")
    ) {
      category = "Utilities";
      subCategory = "Electricity & Municipal Services";
      merchantName = "Utility Bill Payment";
    }
    // 2.7 Salary & Income
    else if (
      text.includes("salary") ||
      text.includes("tankhwah") ||
      text.includes("तनख्वाह") ||
      text.includes("paisa aaya") ||
      text.includes("credit") ||
      text.includes("bonus") ||
      text.includes("kamayi") ||
      text.includes("bikri")
    ) {
      category = "Salary & Income";
      merchantName = "Employer / Direct Deposit";
      type = "income";
      subCategory = "Direct Income & Sales";
    }

    // 3. Payment Method Extraction
    let paymentMethod = "UPI";
    if (text.includes("cash") || text.includes("rokh") || text.includes("nagad")) {
      paymentMethod = "Cash";
    } else if (text.includes("credit card") || text.includes("card")) {
      paymentMethod = "Credit Card";
    } else if (
      text.includes("net banking") ||
      text.includes("netbanking") ||
      text.includes("neft") ||
      text.includes("imps")
    ) {
      paymentMethod = "NetBanking";
    } else if (text.includes("phonepe")) {
      paymentMethod = "PhonePe (UPI)";
    } else if (text.includes("gpay") || text.includes("google pay")) {
      paymentMethod = "Google Pay (UPI)";
    } else if (text.includes("paytm")) {
      paymentMethod = "Paytm (UPI)";
    }

    const reasoning = `Matched ${category} using expense rules.`;
    return {
      amount,
      currency,
      category,
      merchantName,
      description: transcript,
      paymentMethod,
      type,
      confidence: 0.94,
      confidenceScore: 0.94,
      reasoning,
      reasoningNotes: reasoning,
      reasoningProvider: "rules",
      subCategory,
      rawTranscript: transcript,
      speechAnalytics: analyzeSpeechAcoustics({ transcript }),
    };
  }
}
