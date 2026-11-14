#!/usr/bin/env node
/**
 * @fileoverview Submission Package Bundler
 *
 * Automatically generates a self-contained submission dossier and manifest
 * for The Great Indian AI Internship Challenge 2026.
 *
 * Outputs:
 * - dist/submission/manifest.json
 * - dist/submission/evaluations.json
 * - dist/submission/GNANI_AI_SUBMISSION.md
 * - dist/submission/gnani-ai-internship-submission-j-ganesh-kumar-reddy.zip
 *
 * Participant: J Ganesh Kumar Reddy
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outDir = path.resolve(rootDir, "dist", "submission");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log("\n==============================================================================");
console.log("   GENERATING OFFICIAL GNANI AI SUBMISSION PACKAGE");
console.log("   The Great Indian AI Internship Challenge 2026");
console.log("   Candidate: J Ganesh Kumar Reddy (Primary Registrant)");
console.log("==============================================================================\n");

// 1. Copy Key Documentation
const docsToCopy = [
  "GNANI_AI_SUBMISSION.md",
  "SUBMISSION.md",
  "DEMO_AND_POST.md",
  "DEMO_SCRIPT_3MIN.md",
  "DEMO_PRESENTATION.txt",
  "SUBMISSION_QA.md",
  "PROJECT_PRESENTATION.md",
  "PROJECT_FLOW.md",
  "PROJECT_EXPLANATION.md",
];

for (const doc of docsToCopy) {
  const src = path.join(rootDir, doc);
  fs.copyFileSync(src, path.join(outDir, doc));
  console.log(`[+] Bundled: ${doc}`);
}

// 2. Build Submission Manifest
const submissionManifest = {
  challenge: {
    name: "The Great Indian AI Internship Challenge 2026",
    host: "Gnani AI (gnani.biz / app.gnani.ai)",
    closingDate: "2026-11-15T18:00:00+05:30",
    submissionForm: "https://forms.cloud.microsoft/r/dfFShbp7W7",
    internshipStartDate: "January 1, 2027",
    maxStipend: "Up to ₹1 Lakh / month per intern",
    awardCategories: 10,
    awardAmountPerCategory: "₹50,000",
  },
  candidate: {
    fullName: "J Ganesh Kumar Reddy",
    eligibility: "Eligible Indian Higher Education Student (Age >= 18)",
    primaryAccountCredits: 5000,
    participationMode: "Solo Project Architect & Full-Stack Engineer",
  },
  project: {
    title: "FinWise Bharat Voice AI",
    tagline: "Review what an everyday expense would leave in your budget before saving it by voice",
    repositoryUrl: "https://github.com/Ganesh172919/personal-finance",
    techStack: [
      "React 18 + Vite + TailwindCSS PWA",
      "Node.js + Express 5 Enterprise Backend",
      "Python 3.11 + FastAPI AI Core",
      "MongoDB Multi-Tenant Transaction Ledger",
    ],
  },
  gnaniModelsImplemented: {
    stt: {
      model: "Prisma v3.0",
      verification: "Live Hindi ₹50 expense transcription and streaming voice follow-ups verified in the built-in browser",
      capabilities: [
        "12 Indic languages + Hinglish code-switching",
        "8kHz telephonic narrowband bandpass DSP filter",
        "Local simulated street noise for demonstrations",
      ],
      selectableDialects: [
        "hi-IN (Hindi)",
        "hi-en-IN (Hinglish)",
        "te-IN (Telugu)",
        "ta-IN (Tamil)",
        "kn-IN (Kannada)",
        "mr-IN (Marathi)",
        "bn-IN (Bengali)",
        "gu-IN (Gujarati)",
        "ml-IN (Malayalam)",
        "pa-IN (Punjabi)",
        "or-IN (Odia)",
        "en-IN (Indian English)",
      ],
    },
    tts: {
      model: "Timbre (TTS, beta)",
      verification: "Live Hindi synthesis, expense confirmation replay, and English chat playback verified",
      capabilities: [
        "Natural regional voice synthesis (Male/Female)",
        "Spoken transaction confirmation in mother tongue",
        "Localized WhatsApp debt collection voice reminders",
      ],
    },
    llm: {
      model: "Evon v3.3 (30B parameter reasoning model on Hugging Face / Gnani AI)",
      verification: "Requires a separately configured Evon deployment",
      capabilities: [
        "Indic financial entity extraction (Amount, Merchant, Category, Payment Method)",
        "Reviewed drafts and deterministic ledger calculations",
        "Two-way spoken financial advisory copilot",
        "BFSI Khata & Udhar debt tracking with due-date extraction",
        "Illustrative MUDRA and MSME screening with DSCR and EMI calculations",
        "Sample UPI dispute intake and export",
        "Bharat Voice Tax & GST Copilot (FY24-25 New Regime, Sec 87A rebate & MSME composition)",
        "Autonomous Spoken Vyapar Billing & Instant UPI QR Invoicing",
        "Jan Kalyan Government Schemes Voice Navigator (PM SVANidhi, PM-KISAN, Sukanya Samriddhi)",
      ],
    },
    analytics: {
      model: "Simulated speech analytics",
      metrics: [
        "Speech Sentiment Classification",
        "Sample SNR values for telephonic and bazaar scenarios",
        "Speech Rate (WPM) & Pitch Variance (Hz)",
        "Indic Phonetic Fidelity & Code-Mixed Ratio",
        "RBI Fair Practices Code Verification",
      ],
    },
    biometrics: {
      model: "Simulated voice biometrics",
      metrics: [
        "Example speaker match score",
        "Example liveness result",
      ],
    },
    assist: {
      model: "FinWise agent-assist demonstration",
      capabilities: [
        "Real-Time Next-Best-Action (NBA) Engine",
        "Dynamic contextual financial battle cards with Indic talking points",
        "Illustrative compliance indicators",
        "A/B acoustic noise cancellation audition studio (Studio vs Bazaar vs Prisma DSP)",
        "Live Contact Center Telephony Call Simulator & 8kHz AMR-WB Codec",
      ],
    },
  },
  publicDemonstrationLinks: {
    platformX: null,
    linkedIn: null,
    hashtags: ["#GnaniAI", "#GreatIndianAIInternshipChallenge"],
    videoFormat: "60-second and three-minute narrated MP4 walkthroughs using browser captures",
  },
  evaluationMode: "Automated tests and built-in browser QA with a synthetic workspace and live Prisma, Timbre, and Groq",
};

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(submissionManifest, null, 2)
);
console.log("[+] Generated: manifest.json");

// 3. Generate Benchmark Evaluation Logs
const evaluationLogs = {
  source: "Synthetic examples for the FinWise demo",
  verificationCommand: "npm run verify:submission",
  samples: [
    {
      lang: "hi-IN",
      input: "Maine aaj Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye UPI se diye",
      extracted: { amount: 450, merchant: "Sharma Ji Kirana Store", category: "Groceries", payment: "UPI" },
      analytics: { sentiment: "Positive", snrGainDb: 18.4, wpm: 138, rbiCompliant: true },
    },
    {
      lang: "te-IN",
      input: "Kalyan Jewellers lo 25000 petti gold coin konnanu PhonePe dwara",
      extracted: { amount: 25000, merchant: "Kalyan Jewellers", category: "Investment", payment: "PhonePe (UPI)" },
      analytics: { sentiment: "Positive", snrGainDb: 18.4, wpm: 126, rbiCompliant: true },
    },
    {
      lang: "hi-IN (Telephonic 8kHz Khata)",
      input: "Ramesh bhai ko 650 rupaye udhar diye shaniwar tak lautayenge",
      extracted: { amount: 650, contact: "Ramesh Bhai", direction: "lent", dueDate: "Coming Saturday" },
      reminderVoice: "Namaste Ramesh Bhai ji, aapka ₹650 ka udhar baki hai. Kripya Coming Saturday tak bhugtan karein.",
      analytics: { sentiment: "Urgent", snrGainDb: 21.6, environment: "Telephonic 8kHz Bandpass", rbiCompliant: true },
    },
    {
      lang: "hi-IN (UPI Grievance)",
      input: "Mera ₹1,500 cut gaya par dukandar ko nahi mila, UTR number 429182349182, kab wapas aayega?",
      extracted: { amount: 1500, utr: "429182349182", tat: "T + 1 Calendar Day", penalty: "₹100/day", status: "REGISTERED_WITH_NPCI_UDMS" },
      analytics: { sentiment: "Anxious", snrGainDb: 19.8, rbiCompliant: true },
    },
    {
      lang: "hi-IN (Jan Kalyan Scheme)",
      input: "Main ek street vendor thela lagata hoon sabzi bechta hoon aur mujhe 10000 ka loan chahiye working capital ke liye",
      extracted: { scheme: "PM SVANidhi", ministry: "MoHUA", matchScore: 98, benefitAmount: 10000, portal: "pmsvanidhi.mohua.gov.in" },
      analytics: { sentiment: "Cautious", snrGainDb: 18.2, rbiCompliant: true },
    },
    {
      lang: "hi-IN (Voice Biometrics Gate)",
      input: "Mera aawaz meri pehchan hai",
      extracted: { verified: true, matchScore: 0.994, antiSpoofLiveness: 0.988, tokenIssued: true },
      analytics: { sentiment: "Confident", snrGainDb: 20.4, rbiCompliant: true },
    },
  ],
};

fs.writeFileSync(
  path.join(outDir, "evaluations.json"),
  JSON.stringify(evaluationLogs, null, 2)
);
console.log("[+] Generated: evaluations.json");

// 4. Create Standalone Submission Zip Archive
const zipPath = path.join(outDir, "gnani-ai-internship-submission-j-ganesh-kumar-reddy.zip");
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const archiveFiles = [...docsToCopy, "manifest.json", "evaluations.json"];
const demoVideo = "demo/finwise-bharat-voice-demo.mp4";
if (fs.existsSync(path.join(outDir, demoVideo))) archiveFiles.push(demoVideo);
const extendedVideo = "demo/finwise-bharat-voice-3min.mp4";
if (fs.existsSync(path.join(outDir, extendedVideo))) archiveFiles.push(extendedVideo);
if (process.platform === "win32") {
  execFileSync("tar.exe", ["-a", "-cf", zipPath, ...archiveFiles], { cwd: outDir, stdio: "inherit" });
} else {
  execFileSync("zip", ["-q", zipPath, ...archiveFiles], { cwd: outDir, stdio: "inherit" });
}
console.log(`[+] Generated ${path.basename(zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB)`);

console.log("\n------------------------------------------------------------------------------");
console.log(`[SUCCESS] Submission package bundled successfully into: ${outDir}`);
console.log("------------------------------------------------------------------------------\n");
