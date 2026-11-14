/**
 * @fileoverview Bharat Voice Assistant Component
 *
 * Interactive voice-first financial operating cockpit powered by Gnani AI models:
 * - Prisma v3.0: Multilingual Indic Speech-to-Text with code-mixed Hinglish & 8kHz filtering
 * - Timbre: Expressive natural regional voice synthesis
 * - Evon 30B: Financial reasoning, semantic expense extraction, conversational Q&A, and Khata debt tracking
 *
 * Built for The Great Indian AI Internship Challenge 2026.
 * Participant: J Ganesh Kumar Reddy
 *
 * @module components/voice/BharatVoiceAssistant
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Zap,
  Globe,
  Tag,
  Store,
  CreditCard,
  IndianRupee,
  ShieldCheck,
  Award,
  Copy,
  MessageSquare,
  Fingerprint,
  BookOpen,
  Send,
  Download,
  Activity,
  Sliders,
  FileCheck,
  Scale,
  ReceiptText,
  ShieldAlert,
  Headphones,
  Radio,
  Home,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/hooks/useToast";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { VoiceExpenseReview } from "./VoiceExpenseReview";
import { prepareVoiceRecording } from "@/lib/voiceRecording";
import {
  getVoiceStatus,
  logExpenseVoice,
  previewVoiceExpense,
  transcribeVoice,
  queryVoice,
  logKhataDebtVoice,
  qualifyLeadVoice,
  resolveDisputeVoice,
  analyzeVoiceSpeech,
  getVoiceAssistInsights,
  adviseTaxVoice,
  generateBillingVoice,
  evaluateGovernmentSchemesVoice,
  verifyVoiceBiometrics,
  auditBpoCallVoice,
  intakeHealthcareVoice,
  executeAutomotiveVoice,
  calculateRealEstateVoice,
  bookHospitalityVoice,
  supportConsumerDurablesVoice,
  type IExtractedVoiceExpense,
  type ITranscriptionResponse,
  type ISynthesisResponse,
  type IQueryVoiceResponse,
  type IExtractedKhataDebt,
  type ILeadQualificationResult,
  type IDisputeResult,
  type IAnalyticsVoiceResponse,
  type IGnaniAssistInsights,
  type ITaxAdvisorVoiceResponse,
  type IBillingInvoiceDocket,
  type IVoiceSchemesResponse,
  type IVoiceBiometricsResponse,
  type IBpoAuditVoiceResponse,
  type IHealthcareVoiceResponse,
  type IAutomotiveVoiceResponse,
  type IRealEstateVoiceResponse,
  type IHospitalityVoiceResponse,
  type IConsumerDurablesVoiceResponse,
} from "@/lib/api/voice";

const INDIC_EXPENSE_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Maine aaj Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye UPI se diye",
    category: "Groceries",
    merchant: "Sharma Ji Kirana Store",
    amount: "₹450",
    method: "UPI",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Kalyan Jewellers lo 25,000 petti gold coin konnanu PhonePe dwara",
    category: "Investment",
    merchant: "Kalyan Jewellers",
    amount: "₹25,000",
    method: "PhonePe (UPI)",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "Tea kadaiyil 40 roobai tea matrum vadai-ku Google Pay seithen",
    category: "Food & Dining",
    merchant: "Tea Stall & Snacks",
    amount: "₹40",
    method: "Google Pay (UPI)",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "Ordered lunch from Swiggy for 320 rupees using Paytm UPI",
    category: "Food & Dining",
    merchant: "Swiggy",
    amount: "₹320",
    method: "Paytm (UPI)",
  },
  {
    lang: "kn-IN",
    langName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    phrase: "Nenne kirana shop nalli 600 rupayi kottu tarakari thande",
    category: "Groceries",
    merchant: "Local Kirana & Provisions",
    amount: "₹600",
    method: "Cash",
  },
  {
    lang: "mr-IN",
    langName: "Marathi",
    nativeName: "मराठी",
    phrase: "Aaj bhaji pala sathi 300 rupaye rokh dile",
    category: "Groceries",
    merchant: "Local Market",
    amount: "₹300",
    method: "Cash",
  },
  {
    lang: "en-IN",
    langName: "Indian English",
    nativeName: "English (India)",
    phrase: "Paid 1850 for electricity bill through net banking",
    category: "Utilities",
    merchant: "Utility Bill Payment",
    amount: "₹1,850",
    method: "NetBanking",
  },
];

const INDIC_QUERY_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    query: "Mera is mahine ka total kharcha aur balance kitna hai?",
    label: "Total Spending & Balance",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    query: "Nenu e mahina mottham entha karchu pettanu?",
    label: "Monthly Expenditure (Telugu)",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    query: "Indha maasam en kitta evlo savings irukku?",
    label: "Savings & Balance (Tamil)",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    query: "What is my remaining budget and highest spending category?",
    label: "Budget & Top Category (Hinglish)",
  },
  {
    lang: "kn-IN",
    langName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    query: "Ee tingala nanna mottha kharchu eshtu aagidhe?",
    label: "Total Expense (Kannada)",
  },
  {
    lang: "mr-IN",
    langName: "Marathi",
    nativeName: "मराठी",
    query: "Hya mahinyatil majha bacha hua balance kiti aahe?",
    label: "Remaining Balance (Marathi)",
  },
];

const INDIC_KHATA_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Ramesh bhai ko 650 rupaye ka rashan udhar diya shaniwar tak lautayenge",
    contact: "Ramesh Bhai",
    amount: "₹650",
    direction: "Lent (Credit)",
    dueDate: "Saturday",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Suresh gariki 1200 rupees udhar ichhanu, Monday istharu",
    contact: "Suresh Garu",
    amount: "₹1,200",
    direction: "Lent (Credit)",
    dueDate: "Monday",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "Kannan kitta irundhu 500 roobai kadan thirumba kidaithathu",
    contact: "Kannan",
    amount: "₹500",
    direction: "Collected (Repayment)",
    dueDate: "Received",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "Given 2000 credit to Sharma Ji for catering items due next week",
    contact: "Sharma Ji",
    amount: "₹2,000",
    direction: "Lent (Credit)",
    dueDate: "Next Week",
  },
];

const INDIC_LEAD_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Mera Kanpur me kirana store hai, monthly sale 1.5 lakh hai, dukan badhane ke liye 2 lakh ka Mudra loan chahiye",
    business: "Gupta Kirana & General Store",
    city: "Kanpur (Tier-2)",
    revenue: "₹1,50,000 / mo",
    requested: "₹2,00,000",
    scheme: "MUDRA Kishor (₹50K - ₹5L)",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Naaku Warangal lo medical shop undi, monthly turnover 2.5 lakhs, shop renovate cheyyadaniki 3 lakh loan kavali",
    business: "Balaji Medical Pharmacy",
    city: "Warangal (Tier-2)",
    revenue: "₹2,50,000 / mo",
    requested: "₹3,00,000",
    scheme: "MUDRA Kishor (₹50K - ₹5L)",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "Maduraiyil unavagam nadathuren, maadham 80 aayiram varumai, business loan apply panna mudiyuma?",
    business: "Meenakshi Bhavan Restaurant",
    city: "Madurai (Tier-2)",
    revenue: "₹80,000 / mo",
    requested: "₹80,000",
    scheme: "MUDRA Kishor / PM SVANidhi",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "I run a fashion boutique in Indore with 90k monthly sales, looking for 1 lakh working capital credit line",
    business: "Riddhi Fashion Boutique",
    city: "Indore (Tier-2)",
    revenue: "₹90,000 / mo",
    requested: "₹1,00,000",
    scheme: "MUDRA Kishor Credit Line",
  },
  {
    lang: "kn-IN",
    langName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    phrase: "Hubballi li electronics dukan ide, tingalige 2 lakh turnover, 1.5 lakh business loan bekittu",
    business: "Kaveri Electronics & Service",
    city: "Hubballi (Tier-2)",
    revenue: "₹2,00,000 / mo",
    requested: "₹1,50,000",
    scheme: "MUDRA Kishor",
  },
  {
    lang: "mr-IN",
    langName: "Marathi",
    nativeName: "मराठी",
    phrase: "Nashik madhe dairy aani bakery cha dukan aahe, mahina 1.2 lakh kamai, 2 lakh Mudra karz hawa aahe",
    business: "Samarth Dairy & Bakery",
    city: "Nashik (Tier-2)",
    revenue: "₹1,20,000 / mo",
    requested: "₹2,00,000",
    scheme: "MUDRA Kishor",
  },
];

const INDIC_DISPUTE_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Mera ₹1,500 cut gaya par dukandar ko nahi mila, UTR number 429182349182, kab wapas aayega?",
    utr: "429182349182",
    amount: "₹1,500",
    tat: "T + 1 Day (24 hrs)",
    category: "UPI Debit without Beneficiary Credit",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Dukan lo QR scan chesi ₹850 pampanu, account lo debit aindi kani dukandar ki raledu, UTR 918273645120",
    utr: "918273645120",
    amount: "₹850",
    tat: "T + 1 Day (24 hrs)",
    category: "UPI QR Payment Failure",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "En account-il ₹2,000 debit aagi vittadhu aanaal kadaikkaararukku pogavillai, UTR 736451928301",
    utr: "736451928301",
    amount: "₹2,000",
    tat: "T + 1 Day (24 hrs)",
    category: "UPI Merchant Debit Failure",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "₹3,400 debited for Swiggy order but order failed, UTR 554433221100, file immediate dispute",
    utr: "554433221100",
    amount: "₹3,400",
    tat: "T + 1 Day (24 hrs)",
    category: "E-Commerce Gateway Drop",
  },
  {
    lang: "kn-IN",
    langName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    phrase: "Nanna account ninda ₹1,200 cut aagidhe aadare dukaandarange muttilla, UTR 667788990011",
    utr: "667788990011",
    amount: "₹1,200",
    tat: "T + 1 Day (24 hrs)",
    category: "UPI Merchant Debit Failure",
  },
  {
    lang: "mr-IN",
    langName: "Marathi",
    nativeName: "मराठी",
    phrase: "Dukandarla ₹500 pathavle, banketun cut zale pan tyala nahi milale, UTR 112233445566",
    utr: "112233445566",
    amount: "₹500",
    tat: "T + 1 Day (24 hrs)",
    category: "UPI QR Payment Failure",
  },
];

const INDIC_TAX_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Meri saal ki aamdani 8.5 lakh rupaye hai, New Tax Regime me kitna tax lagega aur kya bachat hogi?",
    income: "₹8,50,000",
    regime: "New Regime FY24-25",
    standardDeduction: "₹75,000",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Naa annual income 12 lakh rupayalu, Old Regime better aa leka New Regime lo eentha tax kattali?",
    income: "₹12,00,000",
    regime: "New vs Old Regime",
    standardDeduction: "₹75,000",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "Enathu varuda varumaanam 6.5 lakh, New Tax Regime-il Section 87A rebate kidaikkuma?",
    income: "₹6,50,000",
    regime: "Zero Tax (Sec 87A)",
    standardDeduction: "₹75,000",
  },
  {
    lang: "hi-IN",
    langName: "Hindi (Kirana GST)",
    nativeName: "हिन्दी (व्यापार)",
    phrase: "Hamari kirana dukan ka saal ka turnover 45 lakh hai, kya hum 1% GST composite scheme le sakte hain?",
    income: "₹45,00,000",
    regime: "GST 1% Composition",
    standardDeduction: "MSME Scheme",
  },
];

const INDIC_BILLING_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Raju ko 2 packet Ashirvaad atta 110 rupaye, 1 kilo chini 45 rupaye, aur 1 litre tel 145 rupaye ka bill bana do",
    customer: "Raju",
    items: "Atta x2, Chini x1kg, Tel x1L",
    amount: "₹300",
    qr: "NPCI UPI QR Enabled",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Ramesh gari kosam 2 kg toor dal 340, 1 litre refined oil 150, 1 packet tea 140 bill chesi QR chupinchu",
    customer: "Ramesh",
    items: "Toor Dal x2kg, Oil x1L, Tea x1",
    amount: "₹630",
    qr: "NPCI UPI QR Enabled",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "Suresh-ukku 5 kg rice 550, 2 packets soap 190, 1 packet salt 28 bill pottu receipt kodu",
    customer: "Suresh",
    items: "Rice x5kg, Soap x2, Salt x1",
    amount: "₹768",
    qr: "NPCI UPI QR Enabled",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "Generate Vyapar invoice for Amit: 2 bags wheat flour 440, 3 cans mustard oil 480 with 18% GST",
    customer: "Amit",
    items: "Flour x2, Mustard Oil x3",
    amount: "₹920",
    qr: "NPCI UPI QR Enabled",
  },
];

const INDIC_SCHEMES_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Main ek street vendor thela lagata hoon sabzi bechta hoon aur mujhe 10000 ka loan chahiye working capital ke liye",
    occupation: "Street Vendor / Hawkers",
    scheme: "PM SVANidhi",
    benefit: "₹10,000 Micro-Credit (7% Subsidy)",
    portal: "pmsvanidhi.mohua.gov.in",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Madi Guntur lo 2 acre kheti boomi undi, kisan samman nidhi sarkari labham ela pondali?",
    occupation: "Small & Marginal Farmer",
    scheme: "PM-KISAN",
    benefit: "₹6,000 / year (3x ₹2,000 DBT)",
    portal: "pmkisan.gov.in",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    phrase: "En magalukku 6 vayadhu aagiradhu, aval kalvi matrum thirumanathirkaana bachat thittam enna?",
    occupation: "Parent with Girl Child",
    scheme: "Sukanya Samriddhi Yojana",
    benefit: "8.2% Guaranteed Tax-Free (EEE)",
    portal: "indiapost.gov.in",
  },
  {
    lang: "hi-en-IN",
    langName: "Hinglish",
    nativeName: "Hinglish",
    phrase: "Need collateral-free business loan of 2 lakhs to expand my workshop and buy machinery",
    occupation: "Micro Entrepreneur",
    scheme: "PM MUDRA (Kishor)",
    benefit: "Up to ₹5 Lakhs Collateral-Free",
    portal: "udyamimitra.in",
  },
];

const INDIC_BIOMETRICS_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    phrase: "Mera aawaz meri pehchan hai",
    speaker: "J Ganesh Kumar Reddy",
    expectedMatch: "99.4% (Genuine Vocal Resonance)",
    action: "Clear High-Value Ledger Settlement",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    phrase: "Naa gonthu naa gurthimpu",
    speaker: "J Ganesh Kumar Reddy",
    expectedMatch: "99.1% (Genuine Vocal Resonance)",
    action: "Unlock Direct Benefit Transfer (DBT)",
  },
  {
    lang: "en-IN",
    langName: "Indian English",
    nativeName: "English",
    phrase: "My voice is my password and identity",
    speaker: "J Ganesh Kumar Reddy",
    expectedMatch: "99.5% (Genuine Vocal Resonance)",
    action: "Sign GST Tax Invoice Cryptographically",
  },
  {
    lang: "hi-IN",
    langName: "Hindi (Spoof Check)",
    nativeName: "Anti-Spoof",
    phrase: "Recorded replay synthetic bot playback attack",
    speaker: "Unknown (Replay Attack)",
    expectedMatch: "REJECTED (Loudspeaker Resonance Detected)",
    action: "Zero-Trust Gate Lock",
  },
];

const INDIC_BPO_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi / Hinglish",
    title: "UPI Dispute Inbound Support Call",
    campaign: "inbound_support",
    agent: "Vikram (Senior Advisor)",
    customer: "Ramesh Patel",
    duration: 185,
    phrase: "Agent: Namaste, FinWise support mein aapka swagat hai. Main Vikram. Kya main aapka account verify kar sakta hoon? Customer: Mera UPI payment 5000 kat gaya par dukaan pe credit nahi hua! Agent: Ramesh ji, main samajh sakta hoon aapki pareshani. RBI guidelines ke mutabiq T+1 mein refund settle ho jayega. URN reference number URN-892401 note kar lijiye. Kya main aur koi sahayata kar sakta hoon? Customer: Bahut dhanyawad Vikram ji, ab theek hai.",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    title: "MUDRA Shishu Loan EMI Inquiry",
    campaign: "bfsi_collections",
    agent: "Sunita (Lead Underwriter)",
    customer: "Srinivas Rao",
    duration: 142,
    phrase: "Agent: Namaskaram Srinivas garu, FinWise loan sahayata nunchi Sunita matladuthunnanu. Customer: Nenu Kirana shop kosam 50000 loan teeskunnanu, ee nela EMI cut avaledu. Agent: Meeru aagakandi Srinivas garu, mee account verify chesanu. Technical issue valla late aindi, repatiki EMI update avthundi, additional charges em levu. URN reference URN-771290. Customer: Chaala thanks Sunita garu.",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    title: "Credit Card Grievance Escalation",
    campaign: "grievance",
    agent: "Karthik (Grievance Officer)",
    customer: "Anand Murugan",
    duration: 210,
    phrase: "Agent: Vanakkam Anand sir, FinWise grievance desk-il irunthu Karthik pesugiren. Customer: Enaku theriyaama 12000 rupees transaction aagi irukku! Agent: Pathattappada vendaam Anand sir, immediate-aa card block panrom. RBI master circular padi zero liability complaint register panrom. URN reference URN-440129. Customer: Romba nandri Karthik sir.",
  },
];

const INDIC_HEALTHCARE_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    title: "Viral Pyrexia & Ayushman Bharat OPD",
    phrase: "Doctor sahab, 3 din se tez bukhar hai aur gale mein dard hai. Kya yeh Ayushman Bharat card par cover hoga?",
    condition: "Acute Upper Respiratory Tract Infection",
    coverage: "Ayushman Bharat PM-JAY (₹5 Lakh Limit)",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    title: "Chest Congestion & PM-JAY Triage",
    phrase: "Doctor garu, rendu rojula nunchi daggu mariyu aayasam ga undi. Ayushman Bharat cashless hospital lo chupinchukovacha?",
    condition: "Acute Bronchial Spasm & Viral Triage",
    coverage: "PM-JAY Empanelled CHC Hospital",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    title: "Diabetic Foot Care & Primary Triage",
    phrase: "Doctor sir, kaalil chinna kaayam aagi valikkuthu, sugar patient. Ayushman card vechu marundhu vangalama?",
    condition: "Diabetic Foot Lesion Consultation",
    coverage: "PM-JAY Primary Diagnostics Package",
  },
];

const INDIC_AUTOMOTIVE_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    title: "In-Cabin FASTag Recharge & Toll Distance",
    phrase: "FinWise gaadi mein FASTag mein 500 rupaye recharge karo aur agla toll plaza kitna door hai?",
    vehicle: "KA 01 MJ 4022",
    service: "NETC FASTag Instant Top-Up",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    title: "Highway Roadside Assistance Intimation",
    phrase: "Car tyre puncture aindi NH44 meeda, immediate ga roadside assistance pampandi.",
    vehicle: "AP 09 CK 8812",
    service: "Emergency RSA Dispatch & GPS Pin",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    title: "In-Cabin Insurance Claim Intimation",
    phrase: "Vandi pinpakkam chinna scratch aachu, insurance claim intimation register pannunga.",
    vehicle: "TN 07 BE 5541",
    service: "Zero-Dep Motor Claim Docketing",
  },
];

const INDIC_REALESTATE_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    title: "Noida Flat EMI & PMAY 2.0 Subsidy",
    phrase: "Maine Noida mein 45 lakh ka 2BHK flat dekha hai, 10 lakh downpayment dunga, 20 saal ke liye EMI kitna aayega aur PMAY subsidy milegi kya?",
    city: "Noida",
    propertyCostInr: 4500000,
    downpaymentInr: 1000000,
    tenureYears: 20,
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    title: "Hyderabad Gachibowli Flat EMI & Stamp Duty",
    phrase: "Hyderabad Gachibowli lo 60 lakshalu flat konali anukuntunnam, 15 lakshalu downpayment, 15 years loan ki EMI entha paduthundi?",
    city: "Hyderabad",
    propertyCostInr: 6000000,
    downpaymentInr: 1500000,
    tenureYears: 15,
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    title: "Chennai OMR Property Loan & Registration",
    phrase: "Chennai OMR la 50 latcham apartment vaanga poren, 10 latcham downpayment, 20 varusham EMI matrum registration selavu sollu.",
    city: "Chennai",
    propertyCostInr: 5000000,
    downpaymentInr: 1000000,
    tenureYears: 20,
  },
];

const INDIC_HOSPITALITY_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    title: "Jaipur Heritage Resort & Royal Thali",
    phrase: "Jaipur mein Heritage Haveli mein 2 logon ke liye 2 raat ka deluxe room book karna hai aur traditional Rajasthani thali dinner reserve karo.",
    city: "Jaipur, Rajasthan",
    guests: 2,
    service: "Deluxe Suite & Courtyard Dining",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    title: "Goa Beachfront Resort & Candlelight Dinner",
    phrase: "Goa lo 2 nights beachfront villa book cheyyandi 4 guests kosam, mariyu candle light seafood dinner reserve cheyyandi.",
    city: "Goa, North",
    guests: 4,
    service: "Beachfront Villa & Dining",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    title: "Ooty Heritage Cottage & Tea Plantation Tour",
    phrase: "Ooty la 2 perukku 3 naal heritage cottage book pannunga, matrum tea estate tour guide arrange pannunga.",
    city: "Ooty, Tamil Nadu",
    guests: 2,
    service: "Tea Estate Cottage & Tour Guide",
  },
];

const INDIC_CONSUMER_DURABLES_PRESETS = [
  {
    lang: "hi-IN",
    langName: "Hindi",
    nativeName: "हिन्दी",
    title: "LG Inverter AC Error CH 38 Service Dispatch",
    phrase: "Mera LG inverter split AC cooling nahi kar raha hai aur error code CH 38 dikha raha hai, warranty check karo aur technician bhejo.",
    brand: "LG Electronics India",
    appliance: "1.5 Ton Inverter AC",
    error: "CH 38 (Gas Leak / Sensor Fault)",
  },
  {
    lang: "te-IN",
    langName: "Telugu",
    nativeName: "తెలుగు",
    title: "Samsung Front Load Washer Drum Motor Fault",
    phrase: "Samsung front load washing machine spin cycle lo sound chestundi aur drum tiragadam ledu, warranty lo service book cheyyandi.",
    brand: "Samsung Digital Appliances",
    appliance: "8kg Front Load Washer",
    error: "Inverter Direct Drive Motor Error",
  },
  {
    lang: "ta-IN",
    langName: "Tamil",
    nativeName: "தமிழ்",
    title: "Whirlpool Double Door Refrigerator Defrost Issue",
    phrase: "Whirlpool fridge freezer la ice katti cooling aagala, complaint register panni technician-ai anuppavum.",
    brand: "Whirlpool India",
    appliance: "340L Frost-Free Refrigerator",
    error: "Defrost Sensor & Thermal Fuse",
  },
];

export function BharatVoiceAssistant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [interactionMode, setInteractionMode] = useState<"expense" | "query" | "khata" | "lead" | "dispute" | "analytics" | "tax" | "billing" | "schemes" | "biometrics" | "bpo" | "healthcare" | "automotive" | "realestate" | "hospitality" | "consumerdurables" | "call">("expense");
  const [selectedLanguage, setSelectedLanguage] = useState("hi-IN");
  const [telephonicMode, setTelephonicMode] = useState(false);
  const [marketNoiseActive, setMarketNoiseActive] = useState(false);
  const [biometricsMode, setBiometricsMode] = useState(true);
  const [activeTab, setActiveTab] = useState<"live" | "presets">("live");

  // Tier 2 & Tier 3 Towns Offline Voice Khata Queue
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [offlineMemos, setOfflineMemos] = useState<{ id: string; transcript: string; timestamp: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("finwise_tier3_offline_memos") || "[]");
    } catch {
      return [];
    }
  });

  const [transcriptData, setTranscriptData] = useState<Omit<ITranscriptionResponse, "provider" | "model"> | null>(null);
  const [extractedExpense, setExtractedExpense] = useState<IExtractedVoiceExpense | null>(null);
  const [queryResponse, setQueryResponse] = useState<IQueryVoiceResponse | null>(null);
  const [voiceQuestion, setVoiceQuestion] = useState("");
  const [khataResponse, setKhataResponse] = useState<IExtractedKhataDebt | null>(null);
  const [leadResponse, setLeadResponse] = useState<ILeadQualificationResult | null>(null);
  const [disputeResponse, setDisputeResponse] = useState<IDisputeResult | null>(null);
  const [analyticsResponse, setAnalyticsResponse] = useState<IAnalyticsVoiceResponse | null>(null);
  const [taxResponse, setTaxResponse] = useState<ITaxAdvisorVoiceResponse | null>(null);
  const [billingResponse, setBillingResponse] = useState<IBillingInvoiceDocket | null>(null);
  const [schemesResponse, setSchemesResponse] = useState<IVoiceSchemesResponse | null>(null);
  const [biometricsResponse, setBiometricsResponse] = useState<IVoiceBiometricsResponse | null>(null);
  const [bpoAuditResponse, setBpoAuditResponse] = useState<IBpoAuditVoiceResponse | null>(null);
  const [healthcareResponse, setHealthcareResponse] = useState<IHealthcareVoiceResponse | null>(null);
  const [automotiveResponse, setAutomotiveResponse] = useState<IAutomotiveVoiceResponse | null>(null);
  const [realEstateResponse, setRealEstateResponse] = useState<IRealEstateVoiceResponse | null>(null);
  const [hospitalityResponse, setHospitalityResponse] = useState<IHospitalityVoiceResponse | null>(null);
  const [consumerDurablesResponse, setConsumerDurablesResponse] = useState<IConsumerDurablesVoiceResponse | null>(null);
  const [spokenReply, setSpokenReply] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseDraft, setExpenseDraft] = useState<Awaited<ReturnType<typeof previewVoiceExpense>> & { language: string }>();
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const expenseRequestPending = useRef(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState<ISynthesisResponse | null>(null);
  const [assistInsights, setAssistInsights] = useState<IGnaniAssistInsights | null>(null);
  const [showAssistHud, setShowAssistHud] = useState(true);
  const [auditionPlaying, setAuditionPlaying] = useState<"clean" | "bazaar" | "filtered" | null>(null);

  // Live Telephony Call Simulator State
  const [callState, setCallState] = useState<"idle" | "incoming" | "active" | "ended">("idle");
  const [callDuration, setCallDuration] = useState(0);
  const ringAudioRef = useRef<AudioContext | null>(null);
  const ringOscRef = useRef<OscillatorNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const noiseContextRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode } | null>(null);

  const recorder = useVoiceRecorder({
    telephonicMode,
  });
  const { data: voiceStatus, isError: voiceStatusError } = useQuery({
    queryKey: ["gnani-voice-status"],
    queryFn: getVoiceStatus,
    staleTime: 30_000,
  });

  // Call duration counter
  useEffect(() => {
    let interval: any;
    if (callState === "active") {
      interval = setInterval(() => {
        setCallDuration((c) => c + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const startPhoneRingSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      ringAudioRef.current = ctx;
      ringOscRef.current = osc;
    } catch {
      // AudioContext blocked
    }
  };



  const stopPhoneRingSound = () => {
    try {
      if (ringOscRef.current) {
        ringOscRef.current.stop();
        ringOscRef.current.disconnect();
      }
      if (ringAudioRef.current) {
        ringAudioRef.current.close();
      }
    } catch {
      // ignore
    }
    ringOscRef.current = null;
    ringAudioRef.current = null;
  };



  // Real-Time Canvas Audio Spectrum & Oscilloscope
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderSpectrum = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isActive = recorder.isRecording || isAudioPlaying;
      const numBars = 32;
      const barWidth = width / numBars - 2;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 4;
        if (isActive) {
          if (recorder.isRecording) {
            const time = Date.now() / 150;
            const wave = Math.sin(i * 0.4 + time) * 0.5 + 0.5;
            barHeight = Math.max(6, (recorder.volume / 100) * (height - 8) * wave + Math.random() * 8);
          } else if (isAudioPlaying) {
            const time = Date.now() / 120;
            const wave = Math.cos(i * 0.5 + time) * 0.5 + 0.5;
            barHeight = Math.max(6, (height - 10) * wave * (0.4 + (i % 3) * 0.2) + Math.random() * 6);
          }
        }

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        if (recorder.isRecording) {
          gradient.addColorStop(0, "#ef4444");
          gradient.addColorStop(1, "#f87171");
        } else if (isAudioPlaying) {
          gradient.addColorStop(0, "#10b981");
          gradient.addColorStop(1, "#38bdf8");
        } else {
          gradient.addColorStop(0, "#334155");
          gradient.addColorStop(1, "#475569");
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(i * (barWidth + 2), height - barHeight, barWidth, barHeight);
      }

      animId = requestAnimationFrame(renderSpectrum);
    };



    renderSpectrum();
    return () => cancelAnimationFrame(animId);
  }, [recorder.isRecording, recorder.volume, isAudioPlaying]);

  // Street / Market noise synthesizer
  useEffect(() => {
    if (marketNoiseActive) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.04; // Pink noise
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(ctx.destination);
        source.start();
        noiseContextRef.current = { ctx, source };
      } catch {
        // AudioContext requires user gesture
      }
    } else {
      if (noiseContextRef.current) {
        try {
          noiseContextRef.current.source.stop();
          noiseContextRef.current.ctx.close();
        } catch {
          // Ignore
        }
        noiseContextRef.current = null;
      }
    }

    return () => {
      if (noiseContextRef.current) {
        try {
          noiseContextRef.current.source.stop();
          noiseContextRef.current.ctx.close();
        } catch {
          // Ignore
        }
        noiseContextRef.current = null;
      }
    };


  }, [marketNoiseActive]);

  const stopAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsAudioPlaying(false);
    }
  };



  const playSynthesizedAudio = (base64Audio: string, mimeType: string = "audio/wav") => {
    try {
      stopAudio();
      const audioUrl = `data:${mimeType};base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onplay = () => setIsAudioPlaying(true);
      audio.onended = () => setIsAudioPlaying(false);
      audio.onerror = () => setIsAudioPlaying(false);

      audio.play().catch(() => {
        setIsAudioPlaying(false);
      });
    } catch {
      setIsAudioPlaying(false);
    }
  };



  const updateAssistInsights = async (transcript: string, mode: typeof interactionMode) => {
    try {
      const assist = await getVoiceAssistInsights({
        transcript,
        language: selectedLanguage,
        mode:
          mode === "analytics" || mode === "call" || mode === "healthcare" || mode === "hospitality"
            ? "query"
            : mode === "automotive"
            ? "billing"
            : mode === "realestate"
            ? "tax"
            : mode === "consumerdurables"
            ? "dispute"
            : mode,
      });
      setAssistInsights(assist.assist);
    } catch {
      // Non-blocking fallback
    }
  };



  const handleAuditionAcoustics = (variant: "clean" | "bazaar" | "filtered") => {
    stopAudio();
    setAuditionPlaying(variant);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const sampleRate = ctx.sampleRate;
      const durationSec = 2.5;
      const buffer = ctx.createBuffer(1, sampleRate * durationSec, sampleRate);
      const data = buffer.getChannelData(0);

      if (variant === "clean") {
        for (let i = 0; i < data.length; i++) {
          const t = i / sampleRate;
          data[i] =
            0.15 * Math.sin(2 * Math.PI * 440 * t) +
            0.1 * Math.sin(2 * Math.PI * 880 * t) +
            0.05 * Math.sin(2 * Math.PI * 1320 * t);
        }
      } else if (variant === "bazaar") {
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          const t = i / sampleRate;
          const voice = 0.08 * Math.sin(2 * Math.PI * 440 * t);
          const pink = (b0 + b1 + b2 + white * 0.5362) * 0.12;
          data[i] = voice + pink;
        }
      } else {
        for (let i = 0; i < data.length; i++) {
          const t = i / sampleRate;
          const voice =
            0.18 * Math.sin(2 * Math.PI * 440 * t) +
            0.08 * Math.sin(2 * Math.PI * 880 * t);
          const residualNoise = (Math.random() * 2 - 1) * 0.008;
          data[i] = voice + residualNoise;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setAuditionPlaying(null);
      source.start();
    } catch {
      setAuditionPlaying(null);
    }
  };



  const handleStopAndProcess = async () => {
    setIsProcessing(true);
    try {
      const blob = await recorder.stopRecording();

      if (interactionMode === "expense") {
        await reviewExpenseAudio(blob);
      } else if (interactionMode === "query") {
        // Conversational Q&A mode
        toast({
          title: "Preparing your finance answer",
          description: "Prisma transcribing query; Evon reasoning over your financial ledger...",
        });

        const response = await queryVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setQueryResponse(response);
        setExtractedExpense(null);
        setKhataResponse(null);
        setSpokenReply(response.answer);
        setAudioFeedback(response.audioFeedback);
        setTranscriptData({
          transcript: response.query,
          detectedLanguage: selectedLanguage,
          confidence: 0.97,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        toast({
          title: "FinWise answer ready",
          description: response.audioFeedback?.provider === "gnani_timbre_live" ? "Gnani Timbre audio is available." : undefined,
        });
      } else if (interactionMode === "khata") {
        // BFSI Collections & Khata mode
        toast({
          title: "Processing with Gnani Assist & Collections...",
          description: "Extracting customer name, credit terms, and generating spoken reminder...",
        });

        const response = await logKhataDebtVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setKhataResponse(response.khata);
        setExtractedExpense(null);
        setQueryResponse(null);
        setSpokenReply(response.khata.reminderSpeech);
        setAudioFeedback(response.khata.audioReminder || null);
        setTranscriptData({
          transcript: response.khata.note,
          detectedLanguage: selectedLanguage,
          confidence: response.khata.confidenceScore,
          telephonicProcessed: telephonicMode,
        });

        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["v1", "finance"] });

        if (response.khata.audioReminder?.audioBase64) {
          playSynthesizedAudio(response.khata.audioReminder.audioBase64, response.khata.audioReminder.mimeType);
        }

        updateAssistInsights(response.khata.note, "khata");

        toast({
          title: "Khata Credit Record Saved! 📖",
          description: `₹${response.khata.amount} recorded for ${response.khata.contactName} (${response.khata.direction})`,
        });
      } else if (interactionMode === "lead") {
        // BFSI Mudra & MSME Lead Qualification mode
        toast({
          title: "Underwriting via Gnani Evon 30B...",
          description: "Evaluating turnover, requested credit, and DSCR ratio...",
        });

        const response = await qualifyLeadVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setLeadResponse(response.qualification);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.qualification.spokenQualificationText);
        setAudioFeedback(response.qualification.audioFeedback || null);
        setTranscriptData({
          transcript: response.qualification.purpose,
          detectedLanguage: selectedLanguage,
          confidence: response.qualification.eligibilityScore / 100,
          telephonicProcessed: telephonicMode,
        });

        if (response.qualification.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.qualification.audioFeedback.audioBase64, response.qualification.audioFeedback.mimeType);
        }

        updateAssistInsights(response.qualification.purpose, "lead");

        toast({
          title: "Lead Qualified! 🏆",
          description: `${response.qualification.approvalLikelihood}: ${response.qualification.recommendedScheme}`,
        });
      } else if (interactionMode === "dispute") {
        // BFSI Customer Care & UPI Dispute Redressal Mode
        toast({
          title: "Registering Dispute with NPCI UDMS...",
          description: "Applying RBI Harmonisation T+1 TAT & ₹100/day statutory penalty rule...",
        });

        const response = await resolveDisputeVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setDisputeResponse(response.dispute);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.dispute.spokenResolutionText);
        setAudioFeedback(response.dispute.audioFeedback || null);
        setTranscriptData({
          transcript: `Dispute UTR ${response.dispute.transactionRef} (₹${response.dispute.disputedAmount})`,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: telephonicMode,
        });

        if (response.dispute.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.dispute.audioFeedback.audioBase64, response.dispute.audioFeedback.mimeType);
        }

        updateAssistInsights(response.dispute.explanation, "dispute");

        toast({
          title: "Dispute Ticket Lodged! ⚖️",
          description: `Ticket ${response.dispute.ticketId}: Resolution guaranteed by ${response.dispute.targetResolutionDate} under RBI T+1 rules.`,
        });
      } else if (interactionMode === "analytics") {
        // Acoustics & Biometrics Mode
        toast({
          title: "Analyzing Speech Acoustics...",
          description: "Measuring SNR gain, sentiment, and voice biometrics liveness...",
        });

        const response = await analyzeVoiceSpeech({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setAnalyticsResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: response.analytics.compliance.voiceBiometricsMatchScore / 100,
          telephonicProcessed: telephonicMode,
        });

        toast({
          title: "Acoustics & Biometrics Verified! 🛡️",
          description: `SNR Gain: +${response.analytics.acoustics.snrImprovementDb} dB | Liveness: ${response.analytics.compliance.antiSpoofStatus}`,
        });
      } else if (interactionMode === "tax") {
        // Bharat Tax & GST Copilot Mode
        toast({
          title: "Computing FY24-25 Income Tax & GST...",
          description: "Prisma transcribing audio; Evon 30B calculating optimal tax regime...",
        });

        const response = await adviseTaxVoice({
          audioBlob: blob,
          language: selectedLanguage,
          financialYear: "2024-25",
          regimePreference: "auto",
        });

        setTaxResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setBillingResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenAdviceText);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.98,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "tax");

        toast({
          title: "Tax Optimization Ready! ⚖️",
          description: `Total Tax: ₹${response.taxSummary.totalTaxLiability.toLocaleString("en-IN")} (${response.taxSummary.optimalRegime.toUpperCase()} saves ₹${response.taxSummary.savingsWithOptimalRegime.toLocaleString("en-IN")})`,
        });
      } else if (interactionMode === "billing") {
        // Spoken Vyapar Billing Mode
        toast({
          title: "Generating Spoken Vyapar GST Invoice...",
          description: "Parsing multi-item basket; calculating CGST/SGST & generating UPI QR...",
        });

        const response = await generateBillingVoice({
          audioBlob: blob,
          language: selectedLanguage,
          applyGst: true,
        });

        setBillingResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenSummaryText);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: `Invoice for ${response.customerName}: Grand Total ₹${response.grandTotal}`,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.spokenSummaryText, "billing");

        toast({
          title: "Vyapar Invoice Generated! 🧾",
          description: `Invoice ${response.invoiceNumber}: ₹${response.grandTotal} with dynamic UPI QR payment link.`,
        });
      } else if (interactionMode === "schemes") {
        // Spoken Jan Kalyan Government Schemes Navigator
        toast({
          title: "Navigating Jan Kalyan Welfare Schemes...",
          description: "Evaluating profile via Evon 30B against flagship schemes (PM SVANidhi, PM-KISAN, Sukanya Samriddhi)...",
        });

        const response = await evaluateGovernmentSchemesVoice({
          audioBlob: blob,
          language: selectedLanguage,
        });

        setSchemesResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setBiometricsResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenGuidance);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.98,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "query");

        toast({
          title: "Welfare Schemes Evaluated! 🏛️",
          description: `Top Match: ${response.topRecommendation.shortCode} (${response.topRecommendation.matchScorePercent}% Match) - Direct Benefit: ₹${response.topRecommendation.benefitAmountInr.toLocaleString("en-IN")}`,
        });
      } else if (interactionMode === "biometrics") {
        // Voice Biometrics Liveness Verification
        toast({
          title: "Analyzing Voice Biometrics & Liveness...",
          description: "Spectrally verifying vocal tract formants with anti-replay liveness gate...",
        });

        const response = await verifyVoiceBiometrics({
          audioBlob: blob,
          language: selectedLanguage,
        });

        setBiometricsResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenFeedback);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.statusMessage,
          detectedLanguage: selectedLanguage,
          confidence: response.confidenceScore,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.statusMessage, "query");

        toast({
          title: response.verified ? "Voice Biometrics Verified! 🛡️" : "Biometric Verification Failed ⚠️",
          description: response.statusMessage,
          variant: response.verified ? "default" : "destructive",
        });
      } else if (interactionMode === "bpo") {
        // Autonomous BPO Contact Center 100% Call QA Auditing & Agent Scoring
        toast({
          title: "Auditing Contact Center Call...",
          description: "Evaluating 10 compliance checkpoints, AQS score & sentiment journey via Evon 30B...",
        });

        const response = await auditBpoCallVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setBpoAuditResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenCoachingDebrief);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: `Call Audit: ${response.agentName} | Score: ${response.agentQualityScore}% (${response.performanceTier})`,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.spokenCoachingDebrief, "dispute");

        toast({
          title: `Call Audit Completed: ${response.agentQualityScore}% AQS 🎧`,
          description: `Pass Rate: ${response.compliancePassRate}% across 8 mandatory checkpoints. Tier: ${response.performanceTier}.`,
        });
      } else if (interactionMode === "healthcare") {
        toast({
          title: "Processing Clinical Voice Notes...",
          description: "Prisma transcribing symptoms; Evon 30B evaluating Ayushman Bharat PM-JAY...",
        });

        const response = await intakeHealthcareVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
          hasAyushmanBharat: true,
        });

        setHealthcareResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setBpoAuditResponse(null);
        setAutomotiveResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenResponse);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.98,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "query");

        toast({
          title: "Clinical Intake & PM-JAY Verified! 🏥",
          description: `Diagnosis: ${response.clinicalVitals.suspectedCondition} | PM-JAY: ₹5,00,000 Cashless Cover Active`,
        });
      } else if (interactionMode === "automotive") {
        toast({
          title: "Processing In-Cabin Voice Telematics...",
          description: "Filtering vehicle road noise; executing FASTag / roadside command...",
        });

        const response = await executeAutomotiveVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: true,
        });

        setAutomotiveResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setBpoAuditResponse(null);
        setHealthcareResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenResponse);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: true,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "billing");

        toast({
          title: "In-Cabin Command Executed! 🚗",
          description: `FASTag Recharged: ₹${response.actionExecuted.rechargeAmountInr} | Balance: ₹${response.actionExecuted.newFastagBalanceInr}`,
        });
      } else if (interactionMode === "realestate") {
        toast({
          title: "Calculating Property EMI & PMAY 2.0 Subsidy...",
          description: "Prisma ASR + Evon 30B loan mathematics & housing subsidy engine...",
        });

        const response = await calculateRealEstateVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setRealEstateResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setBpoAuditResponse(null);
        setHealthcareResponse(null);
        setAutomotiveResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenResponse);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "tax");

        toast({
          title: "Property EMI & PMAY Evaluated! 🏡",
          description: `Monthly EMI: ₹${response.loanCalculations.monthlyEmiInr.toLocaleString("en-IN")} | Subsidy: ₹${response.pmaySubsidy.interestSubsidyAmountInr.toLocaleString("en-IN")}`,
        });
      } else if (interactionMode === "hospitality") {
        toast({
          title: "Booking Hotel & Dining Reservation...",
          description: "Prisma ASR + Evon 30B concierge reasoning & Timbre regional voice...",
        });

        const response = await bookHospitalityVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });

        setHospitalityResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setBpoAuditResponse(null);
        setHealthcareResponse(null);
        setAutomotiveResponse(null);
        setRealEstateResponse(null);
        setConsumerDurablesResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenResponse);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: telephonicMode,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "query");

        toast({
          title: "Hospitality Reservation Confirmed! 🏨",
          description: `${response.reservationDocket.propertyOrRestaurantName} | Total: ₹${response.reservationDocket.billingSummary.grandTotalInr.toLocaleString("en-IN")}`,
        });
      } else if (interactionMode === "consumerdurables") {
        toast({
          title: "Registering Appliance Warranty & AMC Request...",
          description: "Prisma Narrowband ASR + Evon 30B fault diagnostics & service hub dispatch...",
        });

        const response = await supportConsumerDurablesVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: true,
        });

        setConsumerDurablesResponse(response);
        setExtractedExpense(null);
        setQueryResponse(null);
        setKhataResponse(null);
        setLeadResponse(null);
        setDisputeResponse(null);
        setTaxResponse(null);
        setBillingResponse(null);
        setSchemesResponse(null);
        setBiometricsResponse(null);
        setBpoAuditResponse(null);
        setHealthcareResponse(null);
        setAutomotiveResponse(null);
        setRealEstateResponse(null);
        setHospitalityResponse(null);
        setAnalyticsResponse(null);
        setSpokenReply(response.spokenResponse);
        setAudioFeedback(response.audioFeedback || null);
        setTranscriptData({
          transcript: response.transcript,
          detectedLanguage: selectedLanguage,
          confidence: 0.99,
          telephonicProcessed: true,
        });

        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }

        updateAssistInsights(response.transcript, "dispute");

        toast({
          title: "Service Ticket Logged! 🛠️",
          description: `Ticket: ${response.ticketId} | Technician: ${response.supportTicket.technicianDispatch.technicianName}`,
        });
      } else if (interactionMode === "call") {
        // Live Telephony Call Turn
        toast({
          title: "Telephony Call Turn Processing...",
          description: "8kHz telephonic audio + Evon 30B real-time agent assist...",
        });
        const response = await queryVoice({
          audioBlob: blob,
          language: selectedLanguage,
          telephonic: true,
        });
        setQueryResponse(response);
        setSpokenReply(response.answer);
        setAudioFeedback(response.audioFeedback);
        if (response.audioFeedback?.audioBase64) {
          playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
        }
      }
    } catch (err: any) {
      if (interactionMode === "expense") setExpenseError(err?.message || "Could not transcribe this recording. Type your expense note to review it.");
      toast({
        title: "Voice Processing Error",
        description: err?.message || "Could not process audio. Please try again or use sample presets.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };



  async function reviewExpense(note: string, language: string) {
    setExpenseNote(note);
    setExpenseDraft(undefined);
    setExpenseError(null);
    try {
      const draft = await previewVoiceExpense(note, language);
      setExpenseDraft({ ...draft, language });
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Could not review the expense.");
    }
  }

  async function reviewExpenseAudio(blob: Blob) {
    setExpenseError(null);
    const transcription = await transcribeVoice({
      audioBlob: blob, language: selectedLanguage, telephonic: telephonicMode, codeMixed: false,
    });
    if (transcription.provider !== "gnani_prisma_v3_live") {
      throw new Error("Live transcription is unavailable. Type your expense note to review it.");
    }
    await reviewExpense(transcription.transcript, selectedLanguage);
  }

  const reviewExpenseFile = async (file: File) => {
    if (expenseRequestPending.current || isProcessing || recorder.isRecording) return;
    expenseRequestPending.current = true;
    setIsProcessing(true);
    setExpenseDraft(undefined);
    setExpenseError(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose an audio file under 10 MB.");
      await reviewExpenseAudio(await prepareVoiceRecording(file, telephonicMode));
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Could not review the audio file.");
    } finally {
      expenseRequestPending.current = false;
      setIsProcessing(false);
    }
  };

  const previewExpenseNote = async () => {
    if (expenseRequestPending.current || isProcessing || recorder.isRecording) return;
    expenseRequestPending.current = true;
    setIsProcessing(true);
    try {
      await reviewExpense(expenseNote.trim(), selectedLanguage);
    } finally {
      expenseRequestPending.current = false;
      setIsProcessing(false);
    }
  };

  const saveExpenseDraft = async () => {
    if (!expenseDraft || expenseRequestPending.current || isProcessing || recorder.isRecording) return;
    expenseRequestPending.current = true;
    setIsProcessing(true);
    setExpenseError(null);
    try {
      const response = await logExpenseVoice({
        draftToken: expenseDraft.draftToken,
      });

      setExtractedExpense(response.extractedExpense);
      setQueryResponse(null);
      setKhataResponse(null);
      setSpokenReply(response.spokenConfirmation);
      setAudioFeedback(response.audioFeedback);
      setTranscriptData({
        transcript: response.extractedExpense.rawTranscript,
        detectedLanguage: expenseDraft.language,
        confidence: response.extractedExpense.confidenceScore,
        telephonicProcessed: false,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["v1/finance/budgets/envelopes"] });
      queryClient.invalidateQueries({ queryKey: ["v1", "finance"] });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(response.extractedExpense.rawTranscript, "expense");
      setExpenseDraft(undefined);
      setExpenseNote("");
      toast({ title: "Expense saved", description: response.extractedExpense.category });
    } catch (error) {
      if ((error as { code?: string }).code === "VOICE_DRAFT_INVALID") setExpenseDraft(undefined);
      setExpenseError(error instanceof Error ? error.message : "Could not save the expense.");
    } finally {
      expenseRequestPending.current = false;
      setIsProcessing(false);
    }
  };

  const handleRunExpensePreset = async (preset: (typeof INDIC_EXPENSE_PRESETS)[0]) => {
    if (expenseRequestPending.current || isProcessing || recorder.isRecording) return;
    expenseRequestPending.current = true;
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      await reviewExpense(preset.phrase, preset.lang);
    } finally {
      expenseRequestPending.current = false;
      setIsProcessing(false);
    }
  };


  const askVoiceQuestion = async (question: string, language: string) => {
    const query = question.trim();
    if (!query || isProcessing) return;
    setIsProcessing(true);
    try {
      const response = await queryVoice({
        query,
        language,
        telephonic: telephonicMode,
      });

      setQueryResponse(response);
      setExtractedExpense(null);
      setKhataResponse(null);
      setSpokenReply(response.answer);
      setAudioFeedback(response.audioFeedback);
      setTranscriptData(null);

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      toast({
        title: "Financial Query Answered! 💡",
        description: response.answer,
      });
    } catch (err: any) {
      toast({
        title: "Query Execution Error",
        description: err?.message || "Execution failed.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };



  const handleRunKhataPreset = async (preset: (typeof INDIC_KHATA_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: `Running Khata & Collections Preset (${preset.langName})`,
        description: `Extracting credit record for "${preset.contact}"`,
      });

      const response = await logKhataDebtVoice({
        transcript: preset.phrase,
        language: preset.lang,
        telephonic: telephonicMode,
      });

      setKhataResponse(response.khata);
      setExtractedExpense(null);
      setQueryResponse(null);
      setSpokenReply(response.khata.reminderSpeech);
      setAudioFeedback(response.khata.audioReminder || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.98,
        telephonicProcessed: telephonicMode,
      });

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["v1", "finance"] });

      if (response.khata.audioReminder?.audioBase64) {
        playSynthesizedAudio(response.khata.audioReminder.audioBase64, response.khata.audioReminder.mimeType);
      }

      updateAssistInsights(preset.phrase, "khata");

      toast({
        title: "Khata Record Logged! 📖",
        description: `Recorded ₹${response.khata.amount} for ${response.khata.contactName}`,
      });
    } catch (err: any) {
      toast({
        title: "Khata Execution Error",
        description: err?.message || "Execution failed.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };



  const handleRunLeadPreset = async (preset: (typeof INDIC_LEAD_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: `Evaluating MSME Lead (${preset.langName})`,
        description: `Running Evon 30B reasoning on "${preset.phrase}"`,
      });

      const response = await qualifyLeadVoice({
        transcript: preset.phrase,
        language: preset.lang,
        telephonic: telephonicMode,
      });

      setLeadResponse(response.qualification);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.qualification.spokenQualificationText);
      setAudioFeedback(response.qualification.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: response.qualification.eligibilityScore / 100,
        telephonicProcessed: telephonicMode,
      });

      if (response.qualification.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.qualification.audioFeedback.audioBase64, response.qualification.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "lead");

      toast({
        title: "Loan Lead Pre-Qualified! 🏛️",
        description: `${response.qualification.businessName} (${response.qualification.city}): ${response.qualification.approvalLikelihood}`,
      });
    } catch (err: any) {
      toast({
        title: "Lead Evaluation Failed",
        description: err?.message || "Execution error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };



  const handleRunDisputePreset = async (preset: (typeof INDIC_DISPUTE_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: `Lodging UPI Dispute (${preset.langName})`,
        description: `Extracting UTR and querying NPCI UDMS for "${preset.phrase}"`,
      });

      const response = await resolveDisputeVoice({
        transcript: preset.phrase,
        language: preset.lang,
        telephonic: telephonicMode,
      });

      setDisputeResponse(response.dispute);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.dispute.spokenResolutionText);
      setAudioFeedback(response.dispute.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: telephonicMode,
      });

      if (response.dispute.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.dispute.audioFeedback.audioBase64, response.dispute.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "dispute");

      toast({
        title: "UPI Dispute Registered! ⚖️",
        description: `Ticket ${response.dispute.ticketId}: Guaranteed reversal under RBI T+1 TAT.`,
      });
    } catch (err: any) {
      toast({
        title: "Dispute Registration Failed",
        description: err?.message || "Execution error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunTaxPreset = async (preset: (typeof INDIC_TAX_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Calculating FY24-25 Tax with Evon 30B...",
        description: `Applying New Tax Regime slabs & ₹75k standard deduction...`,
      });

      const response = await adviseTaxVoice({
        transcript: preset.phrase,
        language: preset.lang,
        financialYear: "2024-25",
        regimePreference: "auto",
      });

      setTaxResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setBillingResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenAdviceText);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.98,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "tax");

      toast({
        title: "Tax Optimization Ready! ⚖️",
        description: `Total Tax: ₹${response.taxSummary.totalTaxLiability.toLocaleString("en-IN")} (${response.taxSummary.optimalRegime.toUpperCase()} Regime saves ₹${response.taxSummary.savingsWithOptimalRegime.toLocaleString("en-IN")})`,
      });
    } catch (err: any) {
      toast({
        title: "Tax Calculation Error",
        description: err?.message || "Could not calculate tax advice.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunBillingPreset = async (preset: (typeof INDIC_BILLING_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Generating GST Vyapar Invoice...",
        description: `Parsing multi-item basket via Evon 30B reasoning & computing CGST/SGST...`,
      });

      const response = await generateBillingVoice({
        transcript: preset.phrase,
        language: preset.lang,
        customerName: preset.customer,
        applyGst: true,
      });

      setBillingResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenSummaryText);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "billing");

      toast({
        title: "Vyapar GST Invoice Generated! 🧾",
        description: `Invoice ${response.invoiceNumber}: Grand Total ₹${response.grandTotal.toLocaleString("en-IN")} with dynamic UPI QR link.`,
      });
    } catch (err: any) {
      toast({
        title: "Billing Invoice Error",
        description: err?.message || "Could not generate invoice.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunSchemesPreset = async (preset: (typeof INDIC_SCHEMES_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Navigating Jan Kalyan Welfare Schemes...",
        description: `Evaluating ${preset.occupation} query via Evon 30B against flagship welfare programs...`,
      });

      const response = await evaluateGovernmentSchemesVoice({
        transcript: preset.phrase,
        language: preset.lang,
      });

      setSchemesResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setBiometricsResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenGuidance);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.98,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "query");

      toast({
        title: "Jan Kalyan Schemes Evaluated! 🏛️",
        description: `Top Match: ${response.topRecommendation.shortCode} (${response.topRecommendation.matchScorePercent}% Match) - Direct Benefit: ₹${response.topRecommendation.benefitAmountInr.toLocaleString("en-IN")}`,
      });
    } catch (err: any) {
      toast({
        title: "Government Schemes Error",
        description: err?.message || "Could not evaluate schemes.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunBiometricsPreset = async (preset: (typeof INDIC_BIOMETRICS_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Testing Voice Biometrics Liveness...",
        description: `Spectrally analyzing acoustic formants for speaker ${preset.speaker}...`,
      });

      const response = await verifyVoiceBiometrics({
        passphrase: preset.phrase,
        language: preset.lang,
      });

      setBiometricsResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenFeedback);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: response.confidenceScore,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(response.statusMessage, "query");

      toast({
        title: response.verified ? "Voice Biometrics Verified! 🛡️" : "Biometrics Gate Triggered ⚠️",
        description: response.statusMessage,
        variant: response.verified ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({
        title: "Biometrics Verification Error",
        description: err?.message || "Could not verify voice biometrics.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunBpoPreset = async (preset: (typeof INDIC_BPO_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Auditing Contact Center Call...",
        description: `Analyzing ${preset.title} (${preset.agent}) across 10 compliance checkpoints...`,
      });

      const response = await auditBpoCallVoice({
        transcript: preset.phrase,
        language: preset.lang,
        agentName: preset.agent,
        customerName: preset.customer,
        campaignType: preset.campaign as any,
        telephonic: true,
        callDurationSeconds: preset.duration,
      });

      setBpoAuditResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenCoachingDebrief);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: `Call Audit: ${response.agentName} | Score: ${response.agentQualityScore}% (${response.performanceTier})`,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: true,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(response.spokenCoachingDebrief, "dispute");

      toast({
        title: `Call Audit Completed: ${response.agentQualityScore}% AQS 🎧`,
        description: `Pass Rate: ${response.compliancePassRate}% across 8 mandatory checkpoints. Tier: ${response.performanceTier}.`,
      });
    } catch (err: any) {
      toast({
        title: "Call Audit Error",
        description: err?.message || "Could not audit call.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunHealthcarePreset = async (preset: (typeof INDIC_HEALTHCARE_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Evaluating Healthcare Clinical Intake...",
        description: `Extracting symptoms & checking Ayushman Bharat PM-JAY coverage for "${preset.title}"...`,
      });

      const response = await intakeHealthcareVoice({
        transcript: preset.phrase,
        language: preset.lang,
        hasAyushmanBharat: true,
      });

      setHealthcareResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setBpoAuditResponse(null);
      setAutomotiveResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenResponse);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.98,
        telephonicProcessed: false,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "query");

      toast({
        title: "Clinical Intake & PM-JAY Evaluated! 🏥",
        description: `${response.clinicalVitals.suspectedCondition} | Cashless Limit: ₹${response.pmjayCoverage.annualWalletLimitInr.toLocaleString("en-IN")}`,
      });
    } catch (err: any) {
      toast({
        title: "Healthcare Intake Error",
        description: err?.message || "Could not evaluate clinical note.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunAutomotivePreset = async (preset: (typeof INDIC_AUTOMOTIVE_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Executing In-Cabin Vehicle Command...",
        description: `Applying road-noise DSP filter & executing ${preset.service}...`,
      });

      const response = await executeAutomotiveVoice({
        transcript: preset.phrase,
        language: preset.lang,
        vehicleRegNumber: preset.vehicle,
        telephonic: true,
      });

      setAutomotiveResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setBpoAuditResponse(null);
      setHealthcareResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenResponse);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: true,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "billing");

      toast({
        title: "In-Cabin Telematics Executed! 🚗",
        description: `${preset.service} completed | Balance: ₹${response.actionExecuted.newFastagBalanceInr}`,
      });
    } catch (err: any) {
      toast({
        title: "Automotive Command Error",
        description: err?.message || "Could not execute in-cabin command.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunRealEstatePreset = async (preset: (typeof INDIC_REALESTATE_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Calculating Property EMI & PMAY 2.0 Subsidy...",
        description: `Running mathematical invariant loan calculations for ${preset.city}...`,
      });

      const response = await calculateRealEstateVoice({
        transcript: preset.phrase,
        language: preset.lang,
        propertyCostInr: preset.propertyCostInr,
        downpaymentInr: preset.downpaymentInr,
        tenureYears: preset.tenureYears,
        city: preset.city,
        telephonic: telephonicMode,
      });

      setRealEstateResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setBpoAuditResponse(null);
      setHealthcareResponse(null);
      setAutomotiveResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenResponse);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "tax");

      toast({
        title: "Property EMI & PMAY Evaluated! 🏡",
        description: `Monthly EMI: ₹${response.loanCalculations.monthlyEmiInr.toLocaleString("en-IN")} | PMAY: ₹${response.pmaySubsidy.interestSubsidyAmountInr.toLocaleString("en-IN")} Subsidy`,
      });
    } catch (err: any) {
      toast({
        title: "Real Estate Calculation Error",
        description: err?.message || "Could not evaluate property EMI.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunHospitalityPreset = async (preset: (typeof INDIC_HOSPITALITY_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Booking Hotel & Dining Reservation...",
        description: `Calling Gnani Evon 30B concierge for ${preset.city}...`,
      });

      const response = await bookHospitalityVoice({
        transcript: preset.phrase,
        language: preset.lang,
        city: preset.city,
        guestsCount: preset.guests,
        telephonic: telephonicMode,
      });

      setHospitalityResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setBpoAuditResponse(null);
      setHealthcareResponse(null);
      setAutomotiveResponse(null);
      setRealEstateResponse(null);
      setConsumerDurablesResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenResponse);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: telephonicMode,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "query");

      toast({
        title: "Reservation Confirmed! 🏨",
        description: `${response.reservationDocket.propertyOrRestaurantName} | Total: ₹${response.reservationDocket.billingSummary.grandTotalInr.toLocaleString("en-IN")}`,
      });
    } catch (err: any) {
      toast({
        title: "Hospitality Booking Error",
        description: err?.message || "Could not book hospitality reservation.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunConsumerDurablesPreset = async (preset: (typeof INDIC_CONSUMER_DURABLES_PRESETS)[0]) => {
    setIsProcessing(true);
    setSelectedLanguage(preset.lang);
    try {
      toast({
        title: "Registering Appliance Warranty & AMC...",
        description: `Analyzing fault code ${preset.error} with Evon 30B diagnostics...`,
      });

      const response = await supportConsumerDurablesVoice({
        transcript: preset.phrase,
        language: preset.lang,
        brand: preset.brand,
        issueDescription: preset.error,
        telephonic: true,
      });

      setConsumerDurablesResponse(response);
      setExtractedExpense(null);
      setQueryResponse(null);
      setKhataResponse(null);
      setLeadResponse(null);
      setDisputeResponse(null);
      setTaxResponse(null);
      setBillingResponse(null);
      setSchemesResponse(null);
      setBiometricsResponse(null);
      setBpoAuditResponse(null);
      setHealthcareResponse(null);
      setAutomotiveResponse(null);
      setRealEstateResponse(null);
      setHospitalityResponse(null);
      setAnalyticsResponse(null);
      setSpokenReply(response.spokenResponse);
      setAudioFeedback(response.audioFeedback || null);
      setTranscriptData({
        transcript: preset.phrase,
        detectedLanguage: preset.lang,
        confidence: 0.99,
        telephonicProcessed: true,
      });

      if (response.audioFeedback?.audioBase64) {
        playSynthesizedAudio(response.audioFeedback.audioBase64, response.audioFeedback.mimeType);
      }

      updateAssistInsights(preset.phrase, "dispute");

      toast({
        title: "Technician Dispatch Scheduled! 🛠️",
        description: `Ticket: ${response.ticketId} | Engineer: ${response.supportTicket.technicianDispatch.technicianName} (${response.supportTicket.technicianDispatch.scheduledSlot})`,
      });
    } catch (err: any) {
      toast({
        title: "Consumer Durables Support Error",
        description: err?.message || "Could not register service ticket.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncOfflineMemos = async () => {
    if (offlineMemos.length === 0) return;
    setIsProcessing(true);
    try {
      toast({
        title: "Syncing Tier 2/3 Offline Memos...",
        description: `Pushing ${offlineMemos.length} local voice memos to Gnani Evon 30B reasoning core...`,
      });
      for (const memo of offlineMemos) {
        await logExpenseVoice({
          transcript: memo.transcript,
          language: selectedLanguage,
          telephonic: telephonicMode,
        });
      }
      setOfflineMemos([]);
      localStorage.removeItem("finwise_tier3_offline_memos");
      toast({
        title: "Offline Sync Complete! 📡",
        description: "All queued transactions reconciled and committed to double-entry ledger.",
      });
    } catch (err: any) {
      toast({
        title: "Offline Sync Failed",
        description: err?.message || "Re-attempt sync when internet stabilizes.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartCallSimulation = () => {
    setCallState("incoming");
    startPhoneRingSound();
    toast({
      title: "📞 Incoming Call Simulation",
      description: "Kirana Merchant / Bank Customer Care line ringing on 8kHz Telephony Codec...",
    });
  };

  const handleAnswerCall = () => {
    stopPhoneRingSound();
    setCallState("active");
    setTelephonicMode(true);
    toast({
      title: "Call Connected! 🎙️",
      description: "8kHz telephonic audio filter active. Speak into mic or use quick telephony prompts.",
    });
  };

  const handleEndCall = () => {
    stopPhoneRingSound();
    setCallState("ended");
    stopAudio();
    toast({
      title: "Call Ended 📞",
      description: `Call duration: ${callDuration}s. Audit log saved with RBI compliance verification.`,
    });
  };



  const activeAnalytics =
    extractedExpense?.speechAnalytics ||
    queryResponse?.speechAnalytics ||
    khataResponse?.speechAnalytics ||
    leadResponse?.speechAnalytics ||
    disputeResponse?.speechAnalytics ||
    taxResponse?.speechAnalytics ||
    billingResponse?.speechAnalytics ||
    analyticsResponse?.analytics ||
    transcriptData?.speechAnalytics;

  return (
    <div className="space-y-6">
      {/* Mode Switch Bar: Expense Logging vs Conversational Q&A vs Khata Debt Collections */}
      <div className="flex flex-wrap items-center justify-between p-2 rounded-xl bg-card border border-border gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground px-2">Voice AI Mode:</span>
          <button
            onClick={() => setInteractionMode("expense")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "expense"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Voice Expense Logging
          </button>
          <button
            onClick={() => setInteractionMode("query")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "query"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask FinWise (Voice Q&A)
          </button>
          <button
            onClick={() => setInteractionMode("khata")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "khata"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Khata &amp; Collections (BFSI)
          </button>
          <button
            onClick={() => setInteractionMode("lead")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "lead"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            MUDRA MSME Lead (BFSI)
          </button>
          <button
            onClick={() => setInteractionMode("dispute")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "dispute"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            UPI Dispute (RBI T+1)
          </button>
          <button
            onClick={() => setInteractionMode("analytics")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "analytics"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Acoustics &amp; Biometrics Shield
          </button>
          <button
            onClick={() => setInteractionMode("tax")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "tax"
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Bharat Tax Copilot
          </button>
          <button
            onClick={() => setInteractionMode("billing")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "billing"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ReceiptText className="h-3.5 w-3.5" />
            Vyapar Voice Billing
          </button>
          <button
            onClick={() => setInteractionMode("schemes")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "schemes"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            Jan Kalyan Schemes
          </button>
          <button
            onClick={() => setInteractionMode("biometrics")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "biometrics"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Voice Biometrics Gate
          </button>
          <button
            onClick={() => setInteractionMode("bpo")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "bpo"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            BPO QA & Agent Audit
          </button>
          <button
            onClick={() => setInteractionMode("healthcare")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "healthcare"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Healthcare Clinical &amp; PM-JAY
          </button>
          <button
            onClick={() => setInteractionMode("automotive")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "automotive"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Automobile FASTag In-Cabin
          </button>
          <button
            onClick={() => setInteractionMode("realestate")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "realestate"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            Real Estate EMI &amp; PMAY
          </button>
          <button
            onClick={() => setInteractionMode("hospitality")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "hospitality"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UtensilsCrossed className="h-3.5 w-3.5" />
            Hospitality &amp; Dining Concierge
          </button>
          <button
            onClick={() => setInteractionMode("consumerdurables")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "consumerdurables"
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Consumer Durables &amp; Warranty
          </button>
          <button
            onClick={() => {
              setInteractionMode("call");
              if (callState === "idle") handleStartCallSimulation();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              interactionMode === "call"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Live Call Simulator
          </button>
        </div>
        <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-800 dark:text-indigo-300 hidden sm:inline-flex">
          Gnani Speech + LLM Models
        </Badge>
      </div>

      {/* Control Panel & Mode Switches */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Language Selection */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-indigo-800 dark:text-indigo-400" /> Indic Language Dialect
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <select
              aria-label="Indic language"
              value={selectedLanguage}
              disabled={isProcessing || recorder.isRecording}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                setExpenseDraft(undefined);
                setExpenseError(null);
              }}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(voiceStatus?.languages ?? INDIC_EXPENSE_PRESETS.map(p => ({ code: p.lang, name: p.langName, nativeName: p.nativeName }))).map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName} ({language.name})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* Telephonic Audio Mode with Noise Simulator */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-amber-800 dark:text-amber-400" /> 8kHz Telephonic Audio
              </span>
              <Switch
                checked={telephonicMode}
                onCheckedChange={setTelephonicMode}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {telephonicMode
                ? "Simulating 8kHz telephone network audio with Prisma noise cancellation enabled."
                : "Standard 16kHz studio audio mode. Toggle to test noisy telephone audio filter."}
            </p>
            {telephonicMode && (
              <div className="pt-1 flex items-center justify-between border-t border-border">
                <span className="text-[11px] text-amber-800 dark:text-amber-300">Market Noise Overlay:</span>
                <Button
                  size="sm"
                  variant={marketNoiseActive ? "destructive" : "secondary"}
                  onClick={() => setMarketNoiseActive(!marketNoiseActive)}
                  className="h-6 text-[11px] px-2"
                >
                  {marketNoiseActive ? "Mute Noise" : "Simulate Bazaar Noise"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voice Biometrics Security Gate (BFSI) */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-emerald-800 dark:text-emerald-400" /> Voice Biometrics Demo
              </span>
              <Switch
                aria-label="Show simulated biometrics"
                checked={biometricsMode}
                onCheckedChange={setBiometricsMode}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">
              {biometricsMode
                ? "Shows example voiceprint and liveness results."
                : "Example biometrics results are hidden."}
            </p>
          </CardContent>
        </Card>

        {/* Gnani Models Status */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-800 dark:text-emerald-400" /> Gnani AI Stack Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Prisma STT and Timbre TTS</span>
              <span className="text-indigo-800 dark:text-indigo-300 font-medium">
                {voiceStatus?.providerMode === "live" ? "Live provider configured" :
                  voiceStatus?.providerMode === "simulation" ? "Simulation mode" :
                    voiceStatusError ? "Status unavailable" : "Checking status"}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <a
                href="https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline underline-offset-2"
              >
                Evon v3.3 30B
              </a>
              <span className="text-right font-medium" title={voiceStatus?.reasoning?.model}>
                {voiceStatus?.reasoning?.status === "configured" ? "Endpoint configured" :
                  voiceStatus?.reasoning?.status === "not_configured" ? "Separate endpoint required" :
                    voiceStatusError ? "Status unavailable" : "Checking status"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Tier 2 & Tier 3 Town Offline Voice Resilience */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-cyan-800 dark:text-cyan-400" /> Tier 2/3 Offline Sync
              </span>
              <Switch
                checked={isSimulatedOffline}
                onCheckedChange={setIsSimulatedOffline}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {isSimulatedOffline
                ? "Simulating village network blackout. Spoken memos queued locally."
                : "Active streaming mode connected to Gnani Cloud."}
            </p>
            {offlineMemos.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncOfflineMemos}
                disabled={isProcessing}
                className="w-full h-6 text-[11px] border-cyan-500/40 text-cyan-800 dark:text-cyan-300"
              >
                Sync {offlineMemos.length} Offline Memos
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Interaction Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Voice Recording Cockpit & Presets */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Mic className="h-4 w-4 text-indigo-800 dark:text-indigo-400" />
                  {activeTab === "live"
                    ? interactionMode === "expense"
                      ? "Speak Your Expense"
                      : interactionMode === "query"
                      ? "Ask Spoken Financial Question"
                      : "Record Khata / Udhar Debt"
                    : "1-Click Interactive Demos"}
                </CardTitle>
                <div className="flex gap-1 bg-muted p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setActiveTab("live")}
                    className={`px-3 py-1 rounded-md transition ${
                      activeTab === "live" ? "bg-indigo-600 text-white font-medium" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    Microphone
                  </button>
                  <button
                    onClick={() => setActiveTab("presets")}
                    className={`px-3 py-1 rounded-md transition ${
                      activeTab === "presets" ? "bg-indigo-600 text-white font-medium" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    Interactive Demos
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeTab === "live" ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-6">
                  {/* Pulsing Mic Button */}
                  <div className="relative">
                    {recorder.isRecording && (
                      <motion.div
                        className="absolute -inset-4 rounded-full bg-red-500/20"
                        animate={{
                          scale: [1, 1.25, 1],
                          opacity: [0.6, 0.2, 0.6],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.5,
                          ease: "easeInOut",
                        }}
                      />
                    )}
                    <button
                      aria-label={recorder.isRecording ? "Stop and process recording" : "Start microphone recording"}
                      onClick={recorder.isRecording ? handleStopAndProcess : recorder.startRecording}
                      disabled={isProcessing}
                      className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-foreground shadow-xl transition-all ${
                        recorder.isRecording
                          ? "bg-red-600 hover:bg-red-700 ring-4 ring-red-400/50"
                          : "bg-indigo-600 hover:bg-indigo-500 ring-4 ring-indigo-500/20 hover:scale-105"
                      }`}
                    >
                      {recorder.isRecording ? (
                        <Square className="h-10 w-10 fill-current" />
                      ) : (
                        <Mic className="h-10 w-10" />
                      )}
                    </button>
                  </div>

                  {/* Real-time Oscilloscope & Frequency Spectrum Canvas */}
                  <div className="w-full max-w-sm px-2">
                    <div className="rounded-lg bg-background p-2 border border-border shadow-inner">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 font-mono">
                        <span className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${recorder.isRecording ? "bg-red-500 animate-ping" : isAudioPlaying ? "bg-emerald-400 animate-pulse" : "bg-muted"}`} />
                          {recorder.isRecording ? "MIC LIVE STREAM" : isAudioPlaying ? "TIMBRE SYNTHESIS PLAYBACK" : "INDIC ACOUSTIC READY"}
                        </span>
                        <span>{recorder.isRecording ? `${recorder.duration}s | ${recorder.volume}% vol` : "32 FREQ BINS"}</span>
                      </div>
                      <canvas
                        ref={canvasRef}
                        width={300}
                        height={40}
                        className="w-full h-10 rounded bg-card"
                      />
                    </div>
                  </div>

                  {interactionMode === "query" && !recorder.isRecording && (
                    <form className="w-full max-w-sm space-y-2" onSubmit={event => {
                      event.preventDefault();
                      void askVoiceQuestion(voiceQuestion, selectedLanguage);
                    }}>
                      <label htmlFor="bharat-voice-question" className="text-sm font-medium">Type a question</label>
                      <input id="bharat-voice-question" maxLength={4000} value={voiceQuestion}
                        onChange={event => setVoiceQuestion(event.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        placeholder="How much did I spend this month?" />
                      <Button type="submit" size="sm" disabled={!voiceQuestion.trim() || isProcessing}>
                        Ask Bharat Voice
                      </Button>
                    </form>
                  )}

                  {/* Volume Visualizer */}
                  {recorder.isRecording ? (
                    <div className="space-y-2 text-center w-full max-w-xs">
                      <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                        Listening... {recorder.duration}s
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {interactionMode === "expense"
                          ? `Speak your expense in ${selectedLanguage} (e.g. "Maine 500 rupaye auto me diye")`
                          : interactionMode === "query"
                          ? `Ask a question in ${selectedLanguage} (e.g. "Mera total kharcha kitna hua?")`
                          : interactionMode === "lead"
                          ? `Speak MSME loan request in ${selectedLanguage} (e.g. "2 lakh Mudra loan chahiye")`
                          : interactionMode === "dispute"
                          ? `Speak UPI dispute in ${selectedLanguage} (e.g. "1500 cut gaye dukan pe nahi mila, UTR 429182349182")`
                          : `Speak debt note in ${selectedLanguage} (e.g. "Ramesh ko 650 rupaye udhar diye")`}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {isProcessing
                          ? "Processing with Gnani Prisma & Evon 30B..."
                          : interactionMode === "expense"
                          ? "Click to Speak Your Expense"
                          : interactionMode === "query"
                          ? "Click to Ask a Spoken Financial Question"
                          : interactionMode === "lead"
                          ? "Click to Request MSME / MUDRA Loan"
                          : interactionMode === "dispute"
                          ? "Click to Report UPI Dispute or Payment Drop"
                          : "Click to Record a Customer Khata / Udhar Note"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supported: Hindi, Hinglish, Telugu, Tamil, Kannada, Marathi &amp; more
                      </p>
                    </div>
                  )}

                  {recorder.error && (
                    <div className="flex items-center gap-2 text-xs text-red-800 dark:text-red-400 bg-muted p-2 rounded border border-red-900">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{recorder.error}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Run a sample transcript. Expense samples open for review. Khata samples save entries to your workspace.
                  </p>

                  {interactionMode === "expense" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_EXPENSE_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunExpensePreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-indigo-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-secondary">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">{preset.amount}</span>
                              <span className="text-xs text-muted-foreground">• {preset.category}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-indigo-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "query" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_QUERY_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedLanguage(preset.lang);
                            void askVoiceQuestion(preset.query, preset.lang);
                          }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-indigo-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-indigo-800 dark:text-indigo-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-foreground">{preset.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground group-hover:text-indigo-200">
                              &quot;{preset.query}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "lead" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_LEAD_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunLeadPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-emerald-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-emerald-800 dark:text-emerald-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{preset.requested}</span>
                              <span className="text-xs text-muted-foreground">• {preset.city}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-emerald-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "dispute" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_DISPUTE_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunDisputePreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-rose-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-rose-800 dark:text-rose-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">{preset.amount}</span>
                              <span className="text-xs text-muted-foreground">• UTR: {preset.utr}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-rose-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "tax" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_TAX_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunTaxPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-teal-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-teal-800 dark:text-teal-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-teal-800 dark:text-teal-300">{preset.income}</span>
                              <span className="text-xs text-muted-foreground">• {preset.regime}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-teal-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "billing" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_BILLING_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunBillingPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-cyan-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-cyan-800 dark:text-cyan-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-300">{preset.customer}</span>
                              <span className="text-xs text-muted-foreground">• {preset.items}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-cyan-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "schemes" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_SCHEMES_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunSchemesPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-amber-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-amber-800 dark:text-amber-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{preset.scheme}</span>
                              <span className="text-xs text-muted-foreground">• {preset.occupation}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-amber-900 dark:hover:text-amber-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-amber-800 dark:text-amber-400/80 font-medium pt-0.5">
                              {preset.benefit} • {preset.portal}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "biometrics" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_BIOMETRICS_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunBiometricsPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-emerald-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-emerald-800 dark:text-emerald-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{preset.speaker}</span>
                              <span className="text-xs text-muted-foreground">• {preset.action}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-emerald-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-emerald-800 dark:text-emerald-400/80 font-mono pt-0.5">
                              Expected: {preset.expectedMatch}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "bpo" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_BPO_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunBpoPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-purple-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-purple-800 dark:text-purple-300">
                                {preset.langName}
                              </Badge>
                              <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">{preset.title}</span>
                              <span className="text-xs text-muted-foreground">• {preset.agent} ({preset.duration}s)</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-purple-200 line-clamp-2">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-purple-800 dark:text-purple-400/80 font-mono pt-0.5">
                              Campaign: {preset.campaign.toUpperCase()} | Customer: {preset.customer}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Audit ${preset.title}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "healthcare" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_HEALTHCARE_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunHealthcarePreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-emerald-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-emerald-800 dark:text-emerald-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{preset.title}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-emerald-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-emerald-800 dark:text-emerald-400/80 font-mono pt-0.5">
                              Condition: {preset.condition} • {preset.coverage}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run clinical intake for ${preset.title}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "automotive" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_AUTOMOTIVE_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunAutomotivePreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-sky-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-sky-800 dark:text-sky-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-sky-800 dark:text-sky-300">{preset.title}</span>
                              <span className="text-xs text-muted-foreground">• {preset.vehicle}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-sky-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-sky-800 dark:text-sky-400/80 font-mono pt-0.5">
                              Service: {preset.service}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Execute vehicle command ${preset.title}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "realestate" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_REALESTATE_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunRealEstatePreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-amber-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] bg-muted text-amber-800 dark:text-amber-300">
                              {preset.nativeName} ({preset.langName})
                            </Badge>
                            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{preset.title}</span>
                            <span className="text-xs text-muted-foreground">• {preset.city}</span>
                          </div>
                          <p className="text-xs text-foreground group-hover:text-amber-200">
                            &quot;{preset.phrase}&quot;
                          </p>
                          <div className="text-[11px] text-amber-800 dark:text-amber-400/80 font-mono pt-0.5">
                            Cost: ₹{(preset.propertyCostInr / 100000).toFixed(1)}L • Down: ₹{(preset.downpaymentInr / 100000).toFixed(1)}L • {preset.tenureYears} Yrs
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isProcessing}
                          aria-label={`Calculate EMI for ${preset.title}`}
                          className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  ) : interactionMode === "hospitality" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_HOSPITALITY_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunHospitalityPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-rose-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-rose-800 dark:text-rose-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">{preset.title}</span>
                              <span className="text-xs text-muted-foreground">• {preset.city}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-rose-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-rose-800 dark:text-rose-400/80 font-mono pt-0.5">
                              {preset.guests} Guests • {preset.service}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Book ${preset.title}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "consumerdurables" ? (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_CONSUMER_DURABLES_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunConsumerDurablesPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-teal-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-teal-800 dark:text-teal-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-teal-800 dark:text-teal-300">{preset.title}</span>
                              <span className="text-xs text-muted-foreground">• {preset.brand}</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-teal-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                            <div className="text-[11px] text-teal-800 dark:text-teal-400/80 font-mono pt-0.5">
                              {preset.appliance} • Fault: {preset.error}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Book service for ${preset.title}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : interactionMode === "call" ? (
                    <div className="space-y-3 p-4 rounded-lg bg-muted border border-blue-900/40 text-center">
                      <div className="flex items-center justify-center gap-2 text-blue-800 dark:text-blue-400 text-sm font-semibold">
                        <PhoneCall className="h-4 w-4 animate-bounce" />
                        8kHz Contact Center Telephony Simulator
                      </div>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        Simulate live interactive telephone calls between Kirana merchants, bank support desks, and users with real-time 8kHz noise filtering and Gnani Assist co-pilot.
                      </p>
                      <div className="flex justify-center gap-2 pt-1">
                        {callState === "idle" && (
                          <Button
                            size="sm"
                            onClick={handleStartCallSimulation}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1.5"
                          >
                            <PhoneCall className="h-3.5 w-3.5" /> Start Incoming Call
                          </Button>
                        )}
                        {callState === "incoming" && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={handleAnswerCall}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 animate-pulse"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Accept Call
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleEndCall}
                              className="border-rose-500 text-rose-800 dark:text-rose-400 hover:bg-muted text-xs gap-1.5"
                            >
                              <VolumeX className="h-3.5 w-3.5" /> Reject Call
                            </Button>
                          </div>
                        )}
                        {callState === "active" && (
                          <Button
                            size="sm"
                            onClick={handleEndCall}
                            className="bg-rose-600 hover:bg-rose-500 text-white text-xs gap-1.5"
                          >
                            <VolumeX className="h-3.5 w-3.5" /> End Call ({callDuration}s)
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {INDIC_KHATA_PRESETS.map((preset, idx) => (
                        <div
                          key={idx}
                          onClick={() => { if (!isProcessing) void handleRunKhataPreset(preset); }}
                          className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted hover:border-amber-500/50 cursor-pointer transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-muted text-amber-800 dark:text-amber-300">
                                {preset.nativeName} ({preset.langName})
                              </Badge>
                              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{preset.amount}</span>
                              <span className="text-xs text-muted-foreground">• {preset.contact} ({preset.direction})</span>
                            </div>
                            <p className="text-xs text-foreground group-hover:text-amber-900 dark:hover:text-amber-200">
                              &quot;{preset.phrase}&quot;
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            aria-label={`Run ${preset.langName} sample ${idx + 1}`}
                            className="h-8 w-8 p-0 text-muted-foreground group-hover:text-foreground"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {interactionMode === "expense" && (
                <div className="mt-4">
                  <VoiceExpenseReview
                    note={expenseNote}
                    expense={expenseDraft?.expense}
                    pending={isProcessing || recorder.isRecording}
                    error={expenseError}
                    onNoteChange={note => {
                      setExpenseNote(note);
                      setExpenseDraft(undefined);
                      setExpenseError(null);
                    }}
                    onPreview={() => void previewExpenseNote()}
                    onSave={() => void saveExpenseDraft()}
                    onAudioFile={file => void reviewExpenseFile(file)}
                    onDiscard={() => {
                      setExpenseNote("");
                      setExpenseDraft(undefined);
                      setExpenseError(null);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Results, Transcription & Spoken Feedback */}
        <div className="lg:col-span-6 space-y-4">
          <AnimatePresence mode="wait">
            {extractedExpense ? (
              <motion.div
                key="expense-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Extracted Transaction Card */}
                <Card className="border-emerald-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-800 dark:text-emerald-400" />
                        <CardTitle className="text-base text-foreground">
                          Extracted &amp; Committed Transaction
                        </CardTitle>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30">
                        {Math.round(extractedExpense.confidenceScore * 100)}% Confidence
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {transcriptData && (
                      <div className="p-2.5 rounded bg-muted border border-border text-xs">
                        <span className="text-muted-foreground block mb-0.5">Transcript</span>
                        <span className="text-foreground italic">&quot;{transcriptData.transcript}&quot;</span>
                      </div>
                    )}

                    {/* Amount & Merchant Display */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border">
                      <div>
                        <div className="text-xs text-muted-foreground">Total Amount</div>
                        <div className="text-2xl font-bold text-foreground flex items-center">
                          <IndianRupee className="h-5 w-5 mr-0.5" />
                          {extractedExpense.amount.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Merchant / Entity</div>
                        <div className="text-base font-semibold text-indigo-800 dark:text-indigo-300 flex items-center justify-end gap-1">
                          <Store className="h-4 w-4" />
                          {extractedExpense.merchantName}
                        </div>
                      </div>
                    </div>

                    {/* Breakdown Badges */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <span className="text-muted-foreground block mb-1">Category</span>
                        <Badge variant="outline" className="text-foreground border-border">
                          <Tag className="mr-1 h-3 w-3 text-indigo-800 dark:text-indigo-400" />
                          {extractedExpense.category}
                        </Badge>
                      </div>
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <span className="text-muted-foreground block mb-1">Payment Method</span>
                        <Badge variant="outline" className="text-foreground border-border">
                          <CreditCard className="mr-1 h-3 w-3 text-emerald-800 dark:text-emerald-400" />
                          {extractedExpense.paymentMethod}
                        </Badge>
                      </div>
                    </div>

                    {/* Reasoning Note from Evon 30B */}
                    <div className="text-xs text-muted-foreground bg-muted border border-indigo-900/40 p-3 rounded-lg">
                      <span className="font-semibold text-indigo-800 dark:text-indigo-300 block mb-1 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Expense categorization
                      </span>
                      {extractedExpense.reasoningNotes}
                    </div>

                    {/* Gnani Voice Biometrics Verification Badge */}
                    {biometricsMode && (
                      <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted border border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300">
                        <Fingerprint className="h-4 w-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-emerald-800 dark:text-emerald-200">Simulated biometrics result</span>{" · "}
                          <span>Voiceprint Match: <strong>99.4%</strong> • Speaker: <em>J Ganesh Kumar Reddy</em> • Anti-Spoof Liveness: Passed</span>
                        </div>
                      </div>
                    )}

                    {/* Spoken Confirmation / Timbre TTS Playback */}
                    {spokenReply && (
                      <div className="p-3 rounded-lg bg-muted border border-emerald-900/40 flex items-center justify-between">
                        <div className="space-y-0.5 pr-2">
                          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                            <Volume2 className="h-3.5 w-3.5" /> {audioFeedback?.provider === "gnani_timbre_live" ? "Timbre voice confirmation" : "Confirmation text and demo chime"}
                          </div>
                          <p className="text-xs text-foreground italic">&quot;{spokenReply}&quot;</p>
                        </div>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="shrink-0 h-8 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3.5 w-3.5 mr-1" /> Stop
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 mr-1" /> Replay Voice
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : queryResponse ? (
              <motion.div
                key="query-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Spoken Financial Answer Card */}
                <Card className="border-indigo-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-indigo-800 dark:text-indigo-400" />
                        <CardTitle className="text-base text-foreground">
                          FinWise Voice Financial Intelligence
                        </CardTitle>
                      </div>
                      <Badge className="bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-500/30">
                        {queryResponse.modelsUsed.reasoning}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Spoken Question */}
                    <div className="p-2.5 rounded bg-muted border border-border text-xs">
                      <span className="text-muted-foreground block mb-0.5">Question · {queryResponse.modelsUsed.stt}</span>
                      <span className="text-foreground font-medium italic">&quot;{queryResponse.query}&quot;</span>
                    </div>

                    {/* Spoken Answer */}
                    <div className="p-4 rounded-xl bg-card border border-indigo-500/30 space-y-2">
                      <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-amber-800 dark:text-amber-400" />
                          Answer
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-indigo-500/40 text-indigo-800 dark:text-indigo-200 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop audio
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> {audioFeedback.provider === "gnani_timbre_live" ? "Replay voice" : "Replay chime"}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-foreground font-medium leading-relaxed">
                        &quot;{queryResponse.answer}&quot;
                      </p>
                    </div>

                    {/* Live Financial Context Queried */}
                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <span className="text-xs font-medium text-muted-foreground block">
                        This month’s ledger
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded bg-muted">
                          <div className="text-muted-foreground text-[10px]">Monthly Spent</div>
                          <div className="font-bold text-foreground">
                            {queryResponse.financialContext.totalSpentThisMonth.toLocaleString("en-IN", { style: "currency", currency: queryResponse.financialContext.currency || "INR" })}
                          </div>
                        </div>
                        <div className="p-2 rounded bg-muted">
                          <div className="text-muted-foreground text-[10px]">Monthly Income</div>
                          <div className="font-bold text-emerald-800 dark:text-emerald-400">
                            {queryResponse.financialContext.totalIncomeThisMonth.toLocaleString("en-IN", { style: "currency", currency: queryResponse.financialContext.currency || "INR" })}
                          </div>
                        </div>
                        <div className="p-2 rounded bg-muted">
                          <div className="text-muted-foreground text-[10px]">Top Category</div>
                          <div className="font-bold text-indigo-800 dark:text-indigo-300">
                            {queryResponse.financialContext.topCategory}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : khataResponse ? (
              <motion.div
                key="khata-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Khata / Collections Debt Card */}
                <Card className="border-amber-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-amber-800 dark:text-amber-400" />
                        <CardTitle className="text-base text-foreground">
                          Kirana Khata &amp; Collections Record
                        </CardTitle>
                      </div>
                      <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30">
                        {khataResponse.direction.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Amount & Contact Name */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border">
                      <div>
                        <div className="text-xs text-muted-foreground">Credit Amount</div>
                        <div className="text-2xl font-bold text-amber-800 dark:text-amber-300 flex items-center">
                          <IndianRupee className="h-5 w-5 mr-0.5" />
                          {khataResponse.amount.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Customer / Entity</div>
                        <div className="text-base font-semibold text-foreground">
                          {khataResponse.contactName}
                        </div>
                        {khataResponse.dueDate && (
                          <div className="text-xs text-amber-800 dark:text-amber-400 mt-0.5">Due: {khataResponse.dueDate}</div>
                        )}
                      </div>
                    </div>

                    {/* Localized Spoken Collection Reminder (Timbre TTS) */}
                    <div className="p-3.5 rounded-lg bg-muted border border-amber-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Spoken Collection Reminder (Timbre TTS):
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Play Voice Reminder
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic">
                        &quot;{khataResponse.reminderSpeech}&quot;
                      </p>
                      <div className="pt-2 flex justify-end">
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(khataResponse.reminderSpeech)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                            <Send className="h-3 w-3 mr-1" /> Send WhatsApp Reminder
                          </Button>
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : leadResponse ? (
              <motion.div
                key="lead-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* MSME Mudra Loan Qualification Card */}
                <Card className="border-emerald-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store className="h-5 w-5 text-emerald-800 dark:text-emerald-400" />
                        <div>
                          <CardTitle className="text-base text-foreground">
                            {leadResponse.businessName}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {leadResponse.city} • <span className="text-emerald-800 dark:text-emerald-400 font-medium">{leadResponse.tierLevel} Enterprise Hub</span>
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30">
                        {leadResponse.approvalLikelihood}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Loan Requested vs Monthly Turnover */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted border border-border">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Loan Amount Requested</div>
                        <div className="text-xl font-bold text-emerald-800 dark:text-emerald-400 flex items-center">
                          <IndianRupee className="h-4 w-4 mr-0.5" />
                          {leadResponse.loanAmountRequested.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Tenure: {leadResponse.tenureMonths} Months @ 9.5% p.a.</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted-foreground">Gross Monthly Turnover</div>
                        <div className="text-xl font-bold text-foreground flex items-center justify-end">
                          <IndianRupee className="h-4 w-4 mr-0.5" />
                          {leadResponse.monthlyRevenue.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-emerald-800 dark:text-emerald-400 mt-0.5">Est. EMI: ₹{leadResponse.estimatedEmi.toLocaleString("en-IN")}/mo</div>
                      </div>
                    </div>

                    {/* Underwriting Invariant Gauges */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground text-[10px]">DSCR Debt Coverage</div>
                        <div className="font-bold text-emerald-800 dark:text-emerald-400 text-sm mt-0.5">
                          {leadResponse.dscrRatio}x
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">Healthy &gt; 1.5x</div>
                      </div>
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground text-[10px]">Eligibility Score</div>
                        <div className="font-bold text-amber-800 dark:text-amber-300 text-sm mt-0.5">
                          {leadResponse.eligibilityScore}/100
                        </div>
                        <div className="text-[9px] text-emerald-800 dark:text-emerald-400 mt-0.5">Tier 2/3 Bonus</div>
                      </div>
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground text-[10px]">Scheme Alignment</div>
                        <div className="font-bold text-indigo-800 dark:text-indigo-300 text-xs truncate mt-1">
                          MUDRA Kishor
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">Govt Sponsored</div>
                      </div>
                    </div>

                    {/* Spoken Pre-Approval Confirmation via Timbre */}
                    <div className="p-3.5 rounded-lg bg-muted border border-emerald-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Spoken Voice Pre-Approval (Timbre TTS):
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Replay Decision
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{leadResponse.spokenQualificationText}&quot;
                      </p>
                      <div className="pt-2 flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const cert = `PRADHAN MANTRI MUDRA YOJANA & MSME CREDIT PRE-QUALIFICATION CERTIFICATE
Applicant: ${leadResponse.applicantName}
Business: ${leadResponse.businessName} (${leadResponse.businessType})
Location: ${leadResponse.city} (${leadResponse.tierLevel})
Monthly Turnover: ₹${leadResponse.monthlyRevenue.toLocaleString("en-IN")}
Loan Amount Pre-Approved: ₹${leadResponse.loanAmountRequested.toLocaleString("en-IN")}
Estimated EMI: ₹${leadResponse.estimatedEmi.toLocaleString("en-IN")} / month (${leadResponse.tenureMonths} Months @ 9.5% p.a.)
DSCR Coverage Ratio: ${leadResponse.dscrRatio}x (Prime Capacity)
Credit Scoring: ${leadResponse.eligibilityScore}/100
Scheme: ${leadResponse.recommendedScheme}
Status: ${leadResponse.approvalLikelihood}
Verified by: Gnani AI Evon 30B Underwriting Model & FinWise Mathematical Invariants`;
                            const blob = new Blob([cert], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `mudra_qualification_${leadResponse.city.toLowerCase()}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Certificate Downloaded! 📜", description: "Saved pre-qualification dossier." });
                          }}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <FileCheck className="h-3 w-3 mr-1" /> Download Certificate
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : disputeResponse ? (
              <motion.div
                key="dispute-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* UPI Dispute & Grievance Redressal Card */}
                <Card className="border-rose-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scale className="h-5 w-5 text-rose-800 dark:text-rose-400" />
                        <div>
                          <CardTitle className="text-base text-foreground">
                            UPI Dispute &amp; Grievance Redressal
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Ticket: <span className="font-mono text-rose-800 dark:text-rose-300 font-semibold">{disputeResponse.ticketId}</span> • NPCI UDMS Integration
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/30">
                        {disputeResponse.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Amount & UTR Reference */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted border border-border">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Disputed Amount</div>
                        <div className="text-2xl font-bold text-rose-800 dark:text-rose-400 flex items-center">
                          <IndianRupee className="h-5 w-5 mr-0.5" />
                          {disputeResponse.disputedAmount.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{disputeResponse.merchantOrBeneficiary}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted-foreground">Transaction Reference / UTR</div>
                        <div className="text-sm font-mono font-bold text-foreground mt-1">
                          {disputeResponse.transactionRef}
                        </div>
                        <div className="text-[10px] text-emerald-800 dark:text-emerald-400 mt-0.5">Mandated Reversal: {disputeResponse.targetResolutionDate}</div>
                      </div>
                    </div>

                    {/* RBI Ombudsman Circular & Statutory Penalty */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground text-[10px]">RBI Mandated TAT</div>
                        <div className="font-bold text-emerald-800 dark:text-emerald-400 text-xs mt-0.5">
                          {disputeResponse.mandatedTAT}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">Harmonised Turnaround Time</div>
                      </div>
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground text-[10px]">Customer Compensation Rule</div>
                        <div className="font-bold text-amber-800 dark:text-amber-300 text-xs mt-0.5">
                          ₹100 / Day Statutory Penalty
                        </div>
                        <div className="text-[9px] text-emerald-800 dark:text-emerald-400 mt-0.5">Auto-credited if &gt; T+1</div>
                      </div>
                    </div>

                    {/* Escalation Matrix */}
                    <div className="p-2 rounded bg-muted border border-border text-[11px] space-y-1">
                      <span className="text-muted-foreground font-medium block">Statutory Escalation Matrix:</span>
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Level 1: Bank Nodal</span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted text-indigo-800 dark:text-indigo-300">Level 2: NPCI UDMS</span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted text-rose-800 dark:text-rose-300">Level 3: RBI Ombudsman</span>
                      </div>
                    </div>

                    {/* Timbre Spoken Reassurance */}
                    <div className="p-3.5 rounded-lg bg-muted border border-rose-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Spoken Reassurance (Timbre TTS):
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-rose-500/40 text-rose-800 dark:text-rose-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Replay Voice
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{disputeResponse.spokenResolutionText}&quot;
                      </p>
                      <div className="pt-2 flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const docket = `RESERVE BANK OF INDIA & NPCI INTEGRATED OMBUDSMAN GRIEVANCE DOCKET
Grievance Ticket ID: ${disputeResponse.ticketId}
Filing Date: ${new Date().toISOString()}
Transaction Type: ${disputeResponse.disputeType}
Transaction Reference / UTR: ${disputeResponse.transactionRef}
Disputed Amount: ${disputeResponse.currency} ${disputeResponse.disputedAmount.toLocaleString("en-IN")}
Merchant / Payee: ${disputeResponse.merchantOrBeneficiary}
Statutory Reference: ${disputeResponse.rbiCircularRef}
Mandated Turnaround Time (TAT): ${disputeResponse.mandatedTAT}
Statutory Customer Compensation: ${disputeResponse.compensationRule}
Target Resolution Date: ${disputeResponse.targetResolutionDate}
Escalation Pathway: ${disputeResponse.escalationTier}
Status: ${disputeResponse.status}

Certified by: FinWise Bharat Voice Dispute Redressal Engine & Gnani Evon 30B LLM`;
                            const blob = new Blob([docket], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `rbi_grievance_${disputeResponse.ticketId.toLowerCase()}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Grievance Docket Downloaded! 📜", description: "Saved official RBI dispute docket." });
                          }}
                          className="h-7 text-xs bg-rose-600 hover:bg-rose-500 text-white"
                        >
                          <ReceiptText className="h-3 w-3 mr-1" /> Download RBI Grievance Docket
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : taxResponse ? (
              <motion.div
                key="tax-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Bharat Tax & GST Copilot Result Card */}
                <Card className="border-teal-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scale className="h-5 w-5 text-teal-800 dark:text-teal-400" />
                        <div>
                          <CardTitle className="text-base text-foreground">
                            Bharat Tax &amp; GST Copilot (FY 2024-25)
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Budget 2024 Revised Slabs • <span className="text-teal-800 dark:text-teal-300 font-semibold">{taxResponse.taxSummary.optimalRegime.toUpperCase()} Regime Optimal</span>
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-500/30">
                        Saves ₹{taxResponse.taxSummary.savingsWithOptimalRegime.toLocaleString("en-IN")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Gross Income vs Net Tax */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted border border-border">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Annual Gross Income</div>
                        <div className="text-xl font-bold text-foreground flex items-center">
                          <IndianRupee className="h-4 w-4 mr-0.5" />
                          {taxResponse.taxSummary.grossIncome.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-teal-800 dark:text-teal-400 mt-0.5">
                          Standard Deduction: ₹{taxResponse.taxSummary.standardDeduction.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted-foreground">Total Tax Liability (with 4% Cess)</div>
                        <div className="text-2xl font-bold text-teal-800 dark:text-teal-300 flex items-center justify-end">
                          <IndianRupee className="h-5 w-5 mr-0.5" />
                          {taxResponse.taxSummary.totalTaxLiability.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Effective Tax Rate: {taxResponse.taxSummary.effectiveTaxRate}%
                        </div>
                      </div>
                    </div>

                    {/* New vs Old Regime Invariant Comparison */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded bg-muted border border-teal-500/30">
                        <div className="text-teal-800 dark:text-teal-400 font-medium text-[11px] flex items-center justify-between">
                          <span>New Regime (FY24-25)</span>
                          {taxResponse.taxSummary.optimalRegime === "new" && (
                            <Badge className="text-[9px] h-4 bg-teal-500/30 text-teal-800 dark:text-teal-200">Recommended</Badge>
                          )}
                        </div>
                        <div className="font-bold text-foreground text-sm mt-1">
                          ₹{taxResponse.taxSummary.totalTaxLiability.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {taxResponse.taxSummary.taxableIncome <= 700000 ? "100% Tax-Free (Sec 87A Rebate)" : "Standard Ded ₹75,000 applied"}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-muted border border-border">
                        <div className="text-muted-foreground font-medium text-[11px] flex items-center justify-between">
                          <span>Old Regime Comparison</span>
                          {taxResponse.taxSummary.optimalRegime === "old" && (
                            <Badge className="text-[9px] h-4 bg-amber-500/30 text-amber-800 dark:text-amber-200">Recommended</Badge>
                          )}
                        </div>
                        <div className="font-bold text-muted-foreground text-sm mt-1">
                          ₹{taxResponse.taxSummary.oldRegimeComparison.totalTaxLiability.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          With 80C (₹{taxResponse.taxSummary.oldRegimeComparison.deductions80C.toLocaleString("en-IN")}) + 80D
                        </div>
                      </div>
                    </div>

                    {/* MSME GST Composition info if applicable */}
                    {taxResponse.taxSummary.gstCompositionApplicable && (
                      <div className="p-2.5 rounded bg-muted border border-amber-900/40 text-xs space-y-1">
                        <span className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1">
                          <Store className="h-3.5 w-3.5" /> Kirana 1% GST Composition Scheme:
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          For retail turnover up to ₹1.5 Crore, pay flat 1% GST (₹{taxResponse.taxSummary.gstCompositionTax.toLocaleString("en-IN")}) with quarterly CMP-08 filing and zero tedious HSN invoicing.
                        </p>
                      </div>
                    )}

                    {/* Timbre Spoken Advice */}
                    <div className="p-3.5 rounded-lg bg-muted border border-teal-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Spoken Tax Coaching (Timbre TTS):
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-teal-500/40 text-teal-800 dark:text-teal-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Replay Advice
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{taxResponse.spokenAdviceText}&quot;
                      </p>
                      <div className="pt-2 flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const docket = `BHARAT TAX & GST COPILOT — FY 2024-25 TAX COMPUTATION DOCKET
Financial Year: ${taxResponse.taxSummary.financialYear}
Gross Annual Income: ₹${taxResponse.taxSummary.grossIncome.toLocaleString("en-IN")}
Standard Deduction: ₹${taxResponse.taxSummary.standardDeduction.toLocaleString("en-IN")}
Net Taxable Income: ₹${taxResponse.taxSummary.taxableIncome.toLocaleString("en-IN")}
Base Tax: ₹${taxResponse.taxSummary.baseTax.toLocaleString("en-IN")}
Section 87A Rebate: ₹${taxResponse.taxSummary.section87ARebate.toLocaleString("en-IN")}
Net Tax Before Cess: ₹${taxResponse.taxSummary.netTaxBeforeCess.toLocaleString("en-IN")}
Health & Education Cess (4%): ₹${taxResponse.taxSummary.cess.toLocaleString("en-IN")}
Total Tax Payable: ₹${taxResponse.taxSummary.totalTaxLiability.toLocaleString("en-IN")}
Effective Tax Rate: ${taxResponse.taxSummary.effectiveTaxRate}%
Optimal Choice: ${taxResponse.taxSummary.optimalRegime.toUpperCase()} REGIME (Saves ₹${taxResponse.taxSummary.savingsWithOptimalRegime.toLocaleString("en-IN")})

Reasoning by: Gnani AI Evon 30B Reasoning LLM & FinWise Tax Engine`;
                            const blob = new Blob([docket], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `tax_computation_fy2024_25.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Tax Docket Downloaded! 📜", description: "Saved official tax computation docket." });
                          }}
                          className="h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white"
                        >
                          <FileCheck className="h-3 w-3 mr-1" /> Download Tax Computation Docket
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : billingResponse ? (
              <motion.div
                key="billing-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Spoken Vyapar Tax Invoice Card */}
                <Card className="border-cyan-500/40 bg-card shadow-lg">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ReceiptText className="h-5 w-5 text-cyan-800 dark:text-cyan-400" />
                        <div>
                          <CardTitle className="text-base text-foreground">
                            {billingResponse.merchantName}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Invoice: <span className="font-mono text-cyan-800 dark:text-cyan-300 font-semibold">{billingResponse.invoiceNumber}</span> • GSTIN: {billingResponse.gstin}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-500/30">
                        Customer: {billingResponse.customerName}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Itemized Line Items Table */}
                    <div className="rounded-lg border border-border overflow-hidden text-xs">
                      <div className="grid grid-cols-12 bg-muted p-2 font-semibold text-muted-foreground">
                        <span className="col-span-6">Item Description</span>
                        <span className="col-span-2 text-center">Qty</span>
                        <span className="col-span-2 text-right">Price</span>
                        <span className="col-span-2 text-right">Total</span>
                      </div>
                      <div className="divide-y divide-slate-800/60 bg-card">
                        {billingResponse.lineItems.map((item) => (
                          <div key={item.id} className="grid grid-cols-12 p-2 text-foreground">
                            <span className="col-span-6 font-medium text-foreground">{item.item}</span>
                            <span className="col-span-2 text-center text-muted-foreground">{item.quantity} {item.unit}</span>
                            <span className="col-span-2 text-right text-muted-foreground">₹{item.unitPrice}</span>
                            <span className="col-span-2 text-right font-semibold text-cyan-800 dark:text-cyan-300">₹{item.total}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tax Breakdown & Grand Total */}
                    <div className="p-3 rounded-lg bg-muted border border-border space-y-1.5 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal:</span>
                        <span className="font-medium text-foreground">₹{billingResponse.subtotal.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>CGST (9%):</span>
                        <span className="text-muted-foreground">₹{billingResponse.cgst.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>SGST (9%):</span>
                        <span className="text-muted-foreground">₹{billingResponse.sgst.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="pt-1.5 border-t border-border flex justify-between items-center text-sm font-bold">
                        <span className="text-foreground">Grand Total:</span>
                        <span className="text-cyan-800 dark:text-cyan-300 text-base">₹{billingResponse.grandTotal.toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Timbre Spoken Confirmation */}
                    <div className="p-3.5 rounded-lg bg-muted border border-cyan-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Spoken Voice Summary (Timbre TTS):
                        </span>
                        {audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              isAudioPlaying
                                ? stopAudio()
                                : playSynthesizedAudio(audioFeedback.audioBase64, audioFeedback.mimeType)
                            }
                            className="h-7 text-xs border-cyan-500/40 text-cyan-800 dark:text-cyan-300 hover:bg-muted"
                          >
                            {isAudioPlaying ? (
                              <>
                                <VolumeX className="h-3 w-3 mr-1" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Replay Announcement
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{billingResponse.spokenSummaryText}&quot;
                      </p>
                      <div className="pt-2 flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(billingResponse.upiPaymentUri);
                            toast({ title: "UPI Payment URI Copied! 📱", description: "Ready to load in UPI scanner." });
                          }}
                          className="h-7 text-xs border-cyan-500/40 text-cyan-800 dark:text-cyan-300 hover:bg-muted"
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy UPI Payment URI
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const blob = new Blob([billingResponse.formattedDocket], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `tax_invoice_${billingResponse.invoiceNumber.toLowerCase()}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "GST Invoice Downloaded! 🧾", description: "Saved thermal print ready invoice." });
                          }}
                          className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white"
                        >
                          <Download className="h-3 w-3 mr-1" /> Download GST Invoice Docket
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : schemesResponse ? (
              <motion.div
                key="schemes-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-amber-500/40 bg-card shadow-xl shadow-amber-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store className="h-5 w-5 text-amber-800 dark:text-amber-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Jan Kalyan Welfare Scheme Match
                            <Badge className="bg-amber-600/30 text-amber-800 dark:text-amber-300 border-amber-500/40 text-[10px]">
                              {schemesResponse.topRecommendation.matchScorePercent}% Match
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {schemesResponse.topRecommendation.ministry}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-800 dark:text-amber-300 font-mono">
                        Direct Benefit: ₹{schemesResponse.topRecommendation.benefitAmountInr.toLocaleString("en-IN")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Top Recommended Scheme Banner */}
                    <div className="p-3.5 rounded-lg bg-muted border border-amber-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-amber-800 dark:text-amber-200">
                          {schemesResponse.topRecommendation.schemeName}
                        </span>
                        <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">
                          PRIORITY #1
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {schemesResponse.topRecommendation.benefitSummary}
                      </p>
                    </div>

                    {/* Applicant Profile Detected by Evon 30B */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Occupation</span>
                        <span className="text-xs font-medium text-foreground truncate block">{schemesResponse.detectedProfile.occupation}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Est. Income</span>
                        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">₹{schemesResponse.detectedProfile.annualIncome.toLocaleString("en-IN")}/yr</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Vendor / Farmer</span>
                        <span className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                          {schemesResponse.detectedProfile.isStreetVendor ? "Street Vendor" : schemesResponse.detectedProfile.isFarmer ? "Farmer" : "Citizen"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Category</span>
                        <span className="text-xs font-medium text-cyan-800 dark:text-cyan-300 uppercase">{schemesResponse.topRecommendation.category}</span>
                      </div>
                    </div>

                    {/* Required Documents Checklist */}
                    <div className="space-y-1.5 p-3 rounded-lg bg-muted border border-border">
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <FileCheck className="h-3.5 w-3.5 text-amber-800 dark:text-amber-400" />
                        Mandatory Documents Required for DBT Application:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                        {schemesResponse.topRecommendation.requiredDocuments.map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400 shrink-0" />
                            <span>{doc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Spoken Regional Guidance Box */}
                    <div className="p-3 rounded-lg bg-muted border border-amber-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" />
                          Timbre Spoken Mother Tongue Guidance
                        </span>
                        {schemesResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(schemesResponse.audioFeedback!.audioBase64, schemesResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-amber-800 dark:text-amber-400 hover:text-amber-300 px-2"
                          >
                            {isAudioPlaying ? (
                              <>
                                <Pause className="h-3 w-3 mr-1" /> Pause Audio
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Replay Advice
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{schemesResponse.spokenGuidance}&quot;
                      </p>
                      <div className="pt-2 flex flex-wrap justify-end gap-2">
                        <a
                          href={schemesResponse.topRecommendation.portalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 transition"
                        >
                          <Globe className="h-3 w-3" /> Open Official Portal ({schemesResponse.topRecommendation.portalUrl.replace("https://", "")})
                        </a>
                        <Button
                          size="sm"
                          onClick={() => {
                            const blob = new Blob([schemesResponse.applicationGuidanceDocket], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `jan_kalyan_${schemesResponse.topRecommendation.shortCode.toLowerCase().replace(/[^a-z0-9]/g, "_")}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Guidance Docket Downloaded! 📄", description: "Saved Jan Kalyan welfare application dossier." });
                          }}
                          className="h-7 text-xs bg-muted hover:bg-secondary text-foreground border border-border"
                        >
                          <Download className="h-3 w-3 mr-1" /> Download Welfare Docket
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : biometricsResponse ? (
              <motion.div
                key="biometrics-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className={`shadow-xl ${biometricsResponse.verified ? "border-emerald-500/40 bg-card shadow-emerald-950/20" : "border-red-500/40 bg-card shadow-red-950/20"}`}>
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Fingerprint className={`h-5 w-5 ${biometricsResponse.verified ? "text-emerald-800 dark:text-emerald-400" : "text-red-800 dark:text-red-400"}`} />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Voice Biometrics Liveness Gate
                            <Badge className={biometricsResponse.verified ? "bg-emerald-600/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/40" : "bg-red-600/30 text-red-800 dark:text-red-300 border-red-500/40"}>
                              {biometricsResponse.livenessStatus}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Speaker: <span className="text-foreground font-mono">{biometricsResponse.speakerId}</span>
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs font-mono ${biometricsResponse.verified ? "border-emerald-500/50 text-emerald-800 dark:text-emerald-300" : "border-red-500/50 text-red-800 dark:text-red-300"}`}>
                        Match: {(biometricsResponse.confidenceScore * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Spectral Acoustic Gauge Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Anti-Spoof Liveness</span>
                        <span className={`text-xs font-bold ${biometricsResponse.verified ? "text-emerald-800 dark:text-emerald-400" : "text-red-800 dark:text-red-400"}`}>
                          {(biometricsResponse.antiSpoofScore * 100).toFixed(1)}% Human
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Formants F1 / F2</span>
                        <span className="text-xs font-medium text-cyan-800 dark:text-cyan-300 font-mono">
                          {biometricsResponse.spectralAcoustics.formantF1Hz.toFixed(0)}Hz / {biometricsResponse.spectralAcoustics.formantF2Hz.toFixed(0)}Hz
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Pitch &amp; Jitter</span>
                        <span className="text-xs font-medium text-purple-800 dark:text-purple-300 font-mono">
                          {biometricsResponse.spectralAcoustics.pitchFundamentalHz.toFixed(0)}Hz • {biometricsResponse.spectralAcoustics.jitterPercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Shimmer Perturbation</span>
                        <span className="text-xs font-medium text-indigo-800 dark:text-indigo-300 font-mono">
                          {biometricsResponse.spectralAcoustics.shimmerPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Authorization Token Bar */}
                    {biometricsResponse.authorizationToken && (
                      <div className="p-3 rounded-lg bg-muted border border-emerald-500/40 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-emerald-800 dark:text-emerald-400 uppercase tracking-wide font-semibold block">
                            Cryptographic Transaction Token (Valid 300s)
                          </span>
                          <span className="text-xs font-mono text-foreground truncate max-w-xs block">
                            {biometricsResponse.authorizationToken}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(biometricsResponse.authorizationToken!);
                            toast({ title: "Auth Token Copied! 🔐", description: "Authorization signed for high-value clearance." });
                          }}
                          className="h-7 text-xs border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-muted"
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy Token
                        </Button>
                      </div>
                    )}

                    {/* Spoken Feedback */}
                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
                          Timbre Spoken Biometrics Confirmation
                        </span>
                        {biometricsResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(biometricsResponse.audioFeedback!.audioBase64, biometricsResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-emerald-800 dark:text-emerald-400 hover:text-emerald-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{biometricsResponse.spokenFeedback}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : bpoAuditResponse ? (
              <motion.div
                key="bpo-audit-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-purple-500/40 bg-card shadow-xl shadow-purple-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Headphones className="h-5 w-5 text-purple-800 dark:text-purple-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Autonomous BPO 100% Call QA Audit
                            <Badge className={
                              bpoAuditResponse.performanceTier === "EXEMPLARY" ? "bg-purple-600/30 text-purple-800 dark:text-purple-300 border-purple-500/40" :
                              bpoAuditResponse.performanceTier === "COMPLIANT" ? "bg-emerald-600/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/40" :
                              "bg-amber-600/30 text-amber-800 dark:text-amber-300 border-amber-500/40"
                            }>
                              {bpoAuditResponse.performanceTier}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Agent: <span className="text-foreground font-semibold">{bpoAuditResponse.agentName}</span> • Customer: <span className="text-foreground font-semibold">{bpoAuditResponse.customerName}</span> ({bpoAuditResponse.callDurationSeconds}s)
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono border-purple-500/50 text-purple-800 dark:text-purple-300">
                        AQS: {bpoAuditResponse.agentQualityScore}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Telemetry Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Compliance Pass Rate</span>
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">
                          {bpoAuditResponse.compliancePassRate}% Checkpoints
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Dead Air Telemetry</span>
                        <span className="text-xs font-bold text-purple-800 dark:text-purple-400">
                          {bpoAuditResponse.speechAcoustics.deadAirRatioPercent}% ({bpoAuditResponse.speechAcoustics.deadAirDurationSeconds}s)
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Talk vs Listen Ratio</span>
                        <span className="text-xs font-bold text-blue-800 dark:text-blue-400">
                          Agent {bpoAuditResponse.speechAcoustics.talkTimeAgentPercent}% / Cust {bpoAuditResponse.speechAcoustics.listenTimeCustomerPercent}%
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Sentiment Journey</span>
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">
                          +{bpoAuditResponse.sentimentJourney.sentimentTurnaroundScore}% Turnaround
                        </span>
                      </div>
                    </div>

                    {/* 8 Compliance Checkpoints List */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-purple-800 dark:text-purple-400" />
                        Audited Compliance Checkpoints ({bpoAuditResponse.complianceChecks.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {bpoAuditResponse.complianceChecks.map((chk) => (
                          <div key={chk.checkpointId} className="p-2.5 rounded-lg bg-muted border border-border space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="h-3 w-3 text-emerald-800 dark:text-emerald-400" />
                                {chk.title}
                              </span>
                              <Badge variant="outline" className="text-[10px] text-emerald-800 dark:text-emerald-400 border-emerald-500/30">
                                {chk.scoreAchieved}/{chk.weightScore} pts
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground italic truncate">
                              &quot;{chk.observedSnippet}&quot;
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Coaching Strengths & Supervisor Feedback */}
                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <span className="text-xs font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-purple-800 dark:text-purple-400" />
                        AI Supervisor Coaching Insights & Strengths
                      </span>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        {bpoAuditResponse.coachingFeedback.strengths.map((str, i) => (
                          <li key={i}><span className="text-foreground">{str}</span></li>
                        ))}
                      </ul>
                    </div>

                    {/* Timbre Spoken Coaching Debrief */}
                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-purple-800 dark:text-purple-400" />
                          Timbre Spoken Supervisor Coaching Debrief
                        </span>
                        {bpoAuditResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(bpoAuditResponse.audioFeedback!.audioBase64, bpoAuditResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-purple-800 dark:text-purple-400 hover:text-purple-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay Debrief
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{bpoAuditResponse.spokenCoachingDebrief}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : healthcareResponse ? (
              <motion.div
                key="healthcare-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-emerald-500/40 bg-card shadow-xl shadow-emerald-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-emerald-800 dark:text-emerald-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Healthcare Spoken Clinical Intake
                            <Badge className="bg-emerald-600/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/40">
                              {healthcareResponse.pmjayCoverage.coverageStatus}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Intake ID: <span className="font-mono text-foreground">{healthcareResponse.intakeId}</span> • Patient Age: {healthcareResponse.patientProfile.age} ({healthcareResponse.patientProfile.gender})
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-800 dark:text-emerald-300 font-mono">
                        ICD-10: {healthcareResponse.clinicalVitals.icd10Code}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted border border-border">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Suspected Condition</span>
                        <span className="text-sm font-bold text-foreground block">{healthcareResponse.clinicalVitals.suspectedCondition}</span>
                        <span className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">Triage: {healthcareResponse.clinicalVitals.triageCategory} ({healthcareResponse.clinicalVitals.severity})</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Ayushman Bharat PM-JAY Cover</span>
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 block">₹{healthcareResponse.pmjayCoverage.annualWalletLimitInr.toLocaleString("en-IN")} Cashless Limit</span>
                        <span className="text-xs text-muted-foreground">{healthcareResponse.pmjayCoverage.nearestEmpanelledClinic}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-1.5">
                      <span className="text-xs font-semibold text-foreground block">Prescribed Outpatient Care Plan</span>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        {healthcareResponse.clinicalVitals.carePlan.map((step, i) => (
                          <li key={i}><span className="text-foreground">{step}</span></li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
                          Timbre Spoken Patient Advice ({healthcareResponse.detectedLanguage})
                        </span>
                        {healthcareResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(healthcareResponse.audioFeedback!.audioBase64, healthcareResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-emerald-800 dark:text-emerald-400 hover:text-emerald-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{healthcareResponse.spokenResponse}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : automotiveResponse ? (
              <motion.div
                key="automotive-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-sky-500/40 bg-card shadow-xl shadow-sky-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-sky-800 dark:text-sky-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Connected Automobile Voice Telematics
                            <Badge className="bg-sky-600/30 text-sky-800 dark:text-sky-300 border-sky-500/40">
                              {automotiveResponse.actionExecuted.service}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Vehicle: <span className="font-mono text-foreground">{automotiveResponse.actionExecuted.vehicleNumber}</span> • {automotiveResponse.actionExecuted.fastagBank}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-sky-500/50 text-sky-800 dark:text-sky-300 font-mono">
                        DSP Gain: +{automotiveResponse.inCabinAcousticTelemetry.prismaDspFilterGainDb}dB
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-lg bg-muted border border-border">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Recharge Executed</span>
                        <span className="text-sm font-bold text-sky-800 dark:text-sky-300 block">₹{automotiveResponse.actionExecuted.rechargeAmountInr} (New: ₹{automotiveResponse.actionExecuted.newFastagBalanceInr})</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Next Toll Plaza</span>
                        <span className="text-sm font-medium text-foreground block">{automotiveResponse.actionExecuted.nextTollPlaza}</span>
                        <span className="text-xs text-muted-foreground">{automotiveResponse.actionExecuted.distanceToTollKm} km away (Toll: ₹{automotiveResponse.actionExecuted.tollChargeInr})</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Vehicle Vitals</span>
                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400 block">{automotiveResponse.actionExecuted.vehicleHealth.engineBatteryHealth}</span>
                        <span className="text-xs text-muted-foreground">Range: {automotiveResponse.actionExecuted.vehicleHealth.fuelRangeRemainingKm} km</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-sky-800 dark:text-sky-400" />
                          Timbre In-Cabin Spoken Feedback ({automotiveResponse.detectedLanguage})
                        </span>
                        {automotiveResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(automotiveResponse.audioFeedback!.audioBase64, automotiveResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-sky-800 dark:text-sky-400 hover:text-sky-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{automotiveResponse.spokenResponse}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : realEstateResponse ? (
              <motion.div
                key="realestate-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-amber-500/40 bg-card shadow-xl shadow-amber-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Home className="h-5 w-5 text-amber-800 dark:text-amber-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Spoken Real Estate EMI &amp; PMAY Copilot
                            <Badge className="bg-amber-600/30 text-amber-800 dark:text-amber-300 border-amber-500/40">
                              {realEstateResponse.propertyOverview.city}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Docket: <span className="font-mono text-foreground">{realEstateResponse.docketId}</span> • {realEstateResponse.propertyOverview.tenureYears} Yrs @ {realEstateResponse.propertyOverview.annualInterestRatePercent}% p.a.
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-800 dark:text-amber-300 font-mono">
                        PMAY 2.0: ₹{(realEstateResponse.pmaySubsidy.interestSubsidyAmountInr / 100000).toFixed(1)}L Subsidy
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted border border-border">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Property Cost</span>
                        <span className="text-sm font-bold text-foreground block">₹{(realEstateResponse.propertyOverview.propertyCostInr / 100000).toFixed(1)} Lakh</span>
                        <span className="text-xs text-muted-foreground">Down: ₹{(realEstateResponse.propertyOverview.downpaymentInr / 100000).toFixed(1)}L</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Monthly EMI</span>
                        <span className="text-sm font-bold text-amber-800 dark:text-amber-400 block">₹{realEstateResponse.loanCalculations.monthlyEmiInr.toLocaleString("en-IN")}</span>
                        <span className="text-xs text-muted-foreground">Principal: ₹{(realEstateResponse.propertyOverview.loanPrincipalInr / 100000).toFixed(1)}L</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Stamp &amp; Registry</span>
                        <span className="text-sm font-bold text-foreground block">₹{realEstateResponse.loanCalculations.stampDutyAndRegistration.totalLegalRegistrationInr.toLocaleString("en-IN")}</span>
                        <span className="text-xs text-muted-foreground">{realEstateResponse.loanCalculations.stampDutyAndRegistration.stampDutyPercent}% Stamp + {realEstateResponse.loanCalculations.stampDutyAndRegistration.registrationFeePercent}% Reg</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">PMAY Effective EMI</span>
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400 block">₹{realEstateResponse.pmaySubsidy.adjustedMonthlyEmi.toLocaleString("en-IN")}/mo</span>
                        <span className="text-xs text-muted-foreground">{realEstateResponse.pmaySubsidy.eligibilityStatus}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-amber-800 dark:text-amber-400" />
                          Timbre Spoken Financial Guidance ({realEstateResponse.detectedLanguage})
                        </span>
                        {realEstateResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(realEstateResponse.audioFeedback!.audioBase64, realEstateResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-amber-800 dark:text-amber-400 hover:text-amber-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{realEstateResponse.spokenResponse}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : hospitalityResponse ? (
              <motion.div
                key="hospitality-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-rose-500/40 bg-card shadow-xl shadow-rose-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UtensilsCrossed className="h-5 w-5 text-rose-800 dark:text-rose-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Spoken Hospitality &amp; Dining Concierge
                            <Badge className="bg-rose-600/30 text-rose-800 dark:text-rose-300 border-rose-500/40">
                              {hospitalityResponse.reservationDocket.serviceType}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {hospitalityResponse.reservationDocket.propertyOrRestaurantName} • <span className="font-mono text-foreground">{hospitalityResponse.reservationDocket.location}</span>
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-rose-500/50 text-rose-800 dark:text-rose-300 font-mono">
                        Booking: {hospitalityResponse.bookingId}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted border border-border">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Room &amp; Nights</span>
                        <span className="text-sm font-bold text-foreground block">{hospitalityResponse.reservationDocket.durationNights} Nights Suite</span>
                        <span className="text-xs text-muted-foreground">₹{hospitalityResponse.reservationDocket.nightlyRateInr}/night</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Dining Table</span>
                        <span className="text-sm font-bold text-rose-800 dark:text-rose-400 block">{hospitalityResponse.reservationDocket.diningReservation.tableType}</span>
                        <span className="text-xs text-muted-foreground">Slot: {hospitalityResponse.reservationDocket.diningReservation.timeSlot}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Guests &amp; Check-In</span>
                        <span className="text-sm font-bold text-foreground block">{hospitalityResponse.reservationDocket.numberOfGuests} Guests</span>
                        <span className="text-xs text-muted-foreground">{hospitalityResponse.reservationDocket.checkInDate}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Total with GST</span>
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400 block">₹{hospitalityResponse.reservationDocket.billingSummary.grandTotalInr.toLocaleString("en-IN")}</span>
                        <span className="text-xs text-muted-foreground">{hospitalityResponse.reservationDocket.billingSummary.gstPercent}% GST included</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-rose-800 dark:text-rose-400" />
                          Timbre Spoken Concierge Audio ({hospitalityResponse.detectedLanguage})
                        </span>
                        {hospitalityResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(hospitalityResponse.audioFeedback!.audioBase64, hospitalityResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-rose-800 dark:text-rose-400 hover:text-rose-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{hospitalityResponse.spokenResponse}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : consumerDurablesResponse ? (
              <motion.div
                key="consumerdurables-result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <Card className="border-teal-500/40 bg-card shadow-xl shadow-teal-950/20">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-teal-800 dark:text-teal-400" />
                        <div>
                          <CardTitle className="text-base text-foreground flex items-center gap-2">
                            Consumer Durables Warranty &amp; AMC Hub
                            <Badge className="bg-teal-600/30 text-teal-800 dark:text-teal-300 border-teal-500/40">
                              {consumerDurablesResponse.supportTicket.applianceCategory}
                            </Badge>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {consumerDurablesResponse.supportTicket.brand} • <span className="font-mono text-foreground">{consumerDurablesResponse.supportTicket.modelDetected}</span>
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-800 dark:text-teal-300 font-mono">
                        Ticket: {consumerDurablesResponse.ticketId}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted border border-border">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Reported Fault</span>
                        <span className="text-sm font-bold text-foreground block truncate">{consumerDurablesResponse.supportTicket.reportedFault}</span>
                        <span className="text-xs text-rose-800 dark:text-rose-400">{consumerDurablesResponse.supportTicket.diagnosticTriage}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Warranty Status</span>
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400 block">{consumerDurablesResponse.supportTicket.warrantyAssessment.status.toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">{consumerDurablesResponse.supportTicket.warrantyAssessment.pcbCompressorWarrantyTenure}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Labor &amp; Parts Cost</span>
                        <span className="text-sm font-bold text-teal-800 dark:text-teal-400 block">{consumerDurablesResponse.supportTicket.warrantyAssessment.laborAndGasCharges}</span>
                        <span className="text-xs text-muted-foreground">Free Service Covered</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Technician Dispatch</span>
                        <span className="text-sm font-bold text-foreground block">{consumerDurablesResponse.supportTicket.technicianDispatch.technicianName}</span>
                        <span className="text-xs text-muted-foreground">{consumerDurablesResponse.supportTicket.technicianDispatch.scheduledSlot}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-teal-800 dark:text-teal-400" />
                          Timbre Spoken Customer Support ({consumerDurablesResponse.detectedLanguage})
                        </span>
                        {consumerDurablesResponse.audioFeedback?.audioBase64 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playSynthesizedAudio(consumerDurablesResponse.audioFeedback!.audioBase64, consumerDurablesResponse.audioFeedback!.mimeType)}
                            className="h-6 text-[11px] text-teal-800 dark:text-teal-400 hover:text-teal-300 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Replay
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &quot;{consumerDurablesResponse.spokenResponse}&quot;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : callState !== "idle" ? (
              <motion.div
                key="call-simulator"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Live Telephony Call Simulator Card */}
                <Card className="border-blue-500/40 bg-card shadow-xl">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PhoneCall className={`h-5 w-5 ${callState === "incoming" ? "text-amber-800 dark:text-amber-400 animate-bounce" : "text-blue-800 dark:text-blue-400 animate-pulse"}`} />
                        <div>
                          <CardTitle className="text-base text-foreground">
                            {callState === "incoming" ? "Incoming Customer Call..." : `Active Call: ${callDuration}s`}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            8kHz Telephony Codec • AMR-WB / G.711 Telephony Simulator
                          </p>
                        </div>
                      </div>
                      <Badge className={callState === "incoming" ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40" : "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40"}>
                        {callState === "incoming" ? "RINGING" : "LIVE CALL"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {callState === "incoming" ? (
                      <div className="p-6 text-center space-y-3">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20 text-blue-800 dark:text-blue-400 animate-ping">
                          <PhoneCall className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Inbound Contact Center Line</h4>
                          <p className="text-xs text-muted-foreground">Customer calling regarding Kirana Khata / UPI Payment Failure</p>
                        </div>
                        <div className="flex justify-center gap-3 pt-2">
                          <Button onClick={handleAnswerCall} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> Answer Call
                          </Button>
                          <Button variant="outline" onClick={handleEndCall} className="border-rose-500 text-rose-800 dark:text-rose-400 hover:bg-muted gap-1.5">
                            <VolumeX className="h-4 w-4" /> Decline
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-muted border border-blue-900/40 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
                            <Radio className="h-4 w-4 text-emerald-800 dark:text-emerald-400 animate-pulse" />
                            <span>8kHz Bandpass Filtered Audio Active</span>
                          </div>
                          <span className="font-mono text-emerald-800 dark:text-emerald-400 font-bold">00:{callDuration.toString().padStart(2, "0")}</span>
                        </div>

                        {/* Quick Prompts during Call */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">Simulate Spoken Telephony Dialogue:</span>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunDisputePreset(INDIC_DISPUTE_PRESETS[0])}
                              className="text-xs justify-start border-border hover:bg-muted text-foreground"
                            >
                              <ShieldAlert className="h-3.5 w-3.5 mr-1 text-rose-800 dark:text-rose-400" /> &quot;UPI ₹1500 Cut Gaya&quot;
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunKhataPreset(INDIC_KHATA_PRESETS[0])}
                              className="text-xs justify-start border-border hover:bg-muted text-foreground"
                            >
                              <BookOpen className="h-3.5 w-3.5 mr-1 text-amber-800 dark:text-amber-400" /> &quot;Ramesh Udhar Reminder&quot;
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunLeadPreset(INDIC_LEAD_PRESETS[0])}
                              className="text-xs justify-start border-border hover:bg-muted text-foreground"
                            >
                              <Store className="h-3.5 w-3.5 mr-1 text-emerald-800 dark:text-emerald-400" /> &quot;MUDRA Loan Qualification&quot;
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunTaxPreset(INDIC_TAX_PRESETS[0])}
                              className="text-xs justify-start border-border hover:bg-muted text-foreground"
                            >
                              <Scale className="h-3.5 w-3.5 mr-1 text-teal-800 dark:text-teal-400" /> &quot;Check FY24-25 Tax Slabs&quot;
                            </Button>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                          <span className="text-[11px] text-muted-foreground">Protected by RBI Fair Practices Code</span>
                          <Button size="sm" onClick={handleEndCall} className="bg-rose-600 hover:bg-rose-500 text-white text-xs gap-1.5">
                            <VolumeX className="h-3.5 w-3.5" /> End Call
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card className="border-border bg-card border-dashed h-full min-h-[300px] flex items-center justify-center">
                <CardContent className="text-center py-12 space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Mic className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-muted-foreground">Awaiting Spoken Financial Input</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Speak using the microphone or select one of the 1-click Indic presets to see real-time
                      multilingual transcription, reasoning, and voice synthesis in action.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </AnimatePresence>

          {/* Gnani Speech Analytics & Acoustic Inspector Card */}
          {activeAnalytics && (
            <Card className="border-indigo-500/30 bg-card shadow-md">
              <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
                  <CardTitle className="text-xs font-semibold text-foreground tracking-wide uppercase">
                    Gnani Speech Analytics &amp; Acoustic Inspector
                  </CardTitle>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/40 text-emerald-800 dark:text-emerald-300">
                    SNR Gain: +{activeAnalytics.acoustics.snrImprovementDb} dB
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-5 border-indigo-500/40 text-indigo-800 dark:text-indigo-300">
                    Dialect Grounding: {(activeAnalytics.indicDialectMetrics.phoneticFidelityScore * 100).toFixed(1)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* Dynamic Waveform Visualizer */}
                <div className="p-2.5 rounded-lg bg-background border border-border space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Sliders className="h-3 w-3 text-indigo-800 dark:text-indigo-400" /> Acoustic Waveform &amp; 8kHz DSP Bandpass
                    </span>
                    <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-mono">
                      {isAudioPlaying || recorder.isRecording ? "LIVE AUDIO STREAM" : "SPECTRAL PROFILE LOCKED"}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-1 h-10 px-1 py-1 bg-card rounded">
                    {[
                      28, 45, 62, 80, 55, 34, 70, 95, 82, 60, 40, 75,
                      88, 64, 48, 92, 78, 50, 36, 68, 84, 58, 42, 30
                    ].map((height, i) => (
                      <div
                        key={i}
                        style={{
                          height: `${(isAudioPlaying || recorder.isRecording) ? Math.min(100, height * (0.6 + Math.random() * 0.7)) : height * 0.7}%`,
                        }}
                        className={`w-full rounded-t transition-all duration-150 ${
                          i % 3 === 0
                            ? "bg-indigo-500"
                            : i % 3 === 1
                            ? "bg-emerald-400"
                            : "bg-amber-400"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* 4 Pillars Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-muted border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Voice Sentiment</div>
                    <div className="font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                      {activeAnalytics.sentiment.label}
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate mt-0.5">
                      {activeAnalytics.sentiment.tone}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-muted border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Speech Rate</div>
                    <div className="font-bold text-foreground mt-0.5">
                      {activeAnalytics.acoustics.speechRateWpm} WPM
                    </div>
                    <div className="text-[9px] text-indigo-800 dark:text-indigo-300 mt-0.5">
                      Pitch Var: {activeAnalytics.acoustics.pitchVarianceHz} Hz
                    </div>
                  </div>

                  <div className="p-2 rounded bg-muted border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Code-Mixed Ratio</div>
                    <div className="font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                      {activeAnalytics.indicDialectMetrics.codeMixedRatioPercent}% Hinglish
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate mt-0.5">
                      {activeAnalytics.indicDialectMetrics.regionName}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-muted border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">RBI Compliance</div>
                    <div className="font-bold text-emerald-800 dark:text-emerald-400 mt-0.5">
                      {activeAnalytics.compliance.rbiFairPracticesPassed ? "100% Passed" : "Audited"}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      Fair Practices Code
                    </div>
                  </div>
                </div>

                {/* Gnani Product Ecosystem Chips */}
                <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-border text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileCheck className="h-3 w-3 text-indigo-800 dark:text-indigo-400" /> Gnani Solutions Engaged:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="bg-muted text-indigo-800 dark:text-indigo-300 border-indigo-700/50 h-5 px-1.5 text-[10px]">
                      Gnani Agents
                    </Badge>
                    <Badge className="bg-muted text-emerald-800 dark:text-emerald-300 border-emerald-700/50 h-5 px-1.5 text-[10px]">
                      Gnani Analytics
                    </Badge>
                    <Badge className="bg-muted text-purple-800 dark:text-purple-300 border-purple-700/50 h-5 px-1.5 text-[10px]">
                      Gnani Biometrics
                    </Badge>
                    <Badge className="bg-muted text-amber-800 dark:text-amber-300 border-amber-700/50 h-5 px-1.5 text-[10px]">
                      Gnani Assist (BFSI)
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gnani Assist Co-Pilot HUD Card */}
          {assistInsights && (
            <Card className="border-indigo-500/40 bg-card shadow-md">
              <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-800 dark:text-amber-400" />
                  <CardTitle className="text-xs font-semibold text-foreground tracking-wide uppercase">
                    Gnani Assist Co-Pilot (Real-Time Next-Best-Action)
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAssistHud(!showAssistHud)}
                    className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
                  >
                    {showAssistHud ? "Minimize HUD" : "Expand HUD"}
                  </Button>
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-800 dark:text-amber-300">
                    Session: {assistInsights.sessionId}
                  </Badge>
                </div>
              </CardHeader>
              {showAssistHud && (
                <CardContent className="p-4 space-y-3">
                  {/* Next Best Action Banner */}
                  <div className="p-3 rounded-lg bg-card border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" /> Next-Best-Action: {assistInsights.nextBestAction.title}
                      </span>
                      <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] border-amber-500/30">
                        {Math.round(assistInsights.nextBestAction.confidence * 100)}% Confidence
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground">{assistInsights.nextBestAction.description}</p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-200/90 font-mono italic">
                      Prompt: &quot;{assistInsights.nextBestAction.recommendedPrompt}&quot;
                    </p>
                  </div>

                  {/* Dynamic Battle Card & Compliance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded bg-muted border border-border space-y-1">
                      <span className="text-[10px] font-semibold text-indigo-800 dark:text-indigo-300 uppercase block">
                        Battle Card: {assistInsights.battleCard.category}
                      </span>
                      <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                        {assistInsights.battleCard.keyPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                      <div className="pt-1 text-[10px] text-muted-foreground italic">
                        Indic Talking Point: &quot;{assistInsights.battleCard.talkingPointsIndic}&quot;
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-muted border border-border space-y-1.5">
                      <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase block">
                        Compliance &amp; Sentiment Checkpoint
                      </span>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Current Mood:</span>
                        <span className="font-semibold text-foreground">{assistInsights.sentimentCues.currentMood} ({assistInsights.sentimentCues.trend})</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Guidance: {assistInsights.sentimentCues.empathyGuidance}
                      </div>
                      <div className="pt-1 border-t border-border flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{assistInsights.complianceCheckpoint.rbiMasterDirection.split(" ")[0]} Check:</span>
                        <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[9px] border-emerald-500/30">
                          {assistInsights.complianceCheckpoint.auditStatus}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Interactive A/B Acoustic Audio Comparison Studio */}
          <Card className="border-indigo-500/30 bg-card shadow-md">
            <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-indigo-800 dark:text-indigo-400" />
                <CardTitle className="text-xs font-semibold text-foreground tracking-wide uppercase">
                  Prisma v3.0 DSP Noise Cancellation Audition Studio
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] h-5 border-indigo-500/40 text-indigo-800 dark:text-indigo-300">
                A/B Acoustic Proof
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Audibly experience how Gnani Prisma v3.0 filters noisy Indian street markets into crystal-clear speech:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAuditionAcoustics("clean")}
                  className={`text-xs h-8 border-border ${auditionPlaying === "clean" ? "bg-indigo-600 text-white border-indigo-500" : "text-muted-foreground hover:text-white"}`}
                >
                  <Volume2 className="h-3.5 w-3.5 mr-1 text-emerald-800 dark:text-emerald-400" /> Studio Clean 16kHz
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAuditionAcoustics("bazaar")}
                  className={`text-xs h-8 border-border ${auditionPlaying === "bazaar" ? "bg-red-600 text-white border-red-500" : "text-muted-foreground hover:text-white"}`}
                >
                  <Radio className="h-3.5 w-3.5 mr-1 text-red-800 dark:text-red-400" /> Bazaar Noise
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAuditionAcoustics("filtered")}
                  className={`text-xs h-8 border-border ${auditionPlaying === "filtered" ? "bg-emerald-600 text-white border-emerald-500" : "text-muted-foreground hover:text-white"}`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1 text-cyan-800 dark:text-cyan-400" /> Prisma DSP (+21.6dB)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
