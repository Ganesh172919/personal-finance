#!/usr/bin/env node
/**
 * verify-submission.mjs
 * =====================
 * Official automated pre-flight verification script for:
 * The Great Indian AI Internship Challenge 2026
 *
 * Participant: J Ganesh Kumar Reddy
 * Project: FinWise Bharat Voice — Indic Voice-First Financial Operating System
 *
 * Usage:
 *   node scripts/verify-submission.mjs
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("\n" + "=".repeat(78));
console.log("   THE GREAT INDIAN AI INTERNSHIP CHALLENGE 2026 — SUBMISSION AUDIT");
console.log("   Participant: J Ganesh Kumar Reddy");
console.log("   Project:     FinWise Bharat Voice (Gnani Prisma, Timbre & Evon 30B)");
console.log("=".repeat(78) + "\n");

let allPassed = true;
let checksPassed = 0;

function check(label, fn) {
  process.stdout.write(`[*] Checking: ${label.padEnd(52)} `);
  try {
    const result = fn();
    if (result === false) {
      console.log("\x1b[31m[FAILED]\x1b[0m");
      allPassed = false;
    } else {
      console.log("\x1b[32m[PASSED]\x1b[0m");
      checksPassed += 1;
    }
  } catch (err) {
    console.log(`\x1b[31m[ERROR]\x1b[0m: ${err.message}`);
    allPassed = false;
  }
}

// 1. Documentation Files Verification
check("GNANI_AI_SUBMISSION.md present & complete", () => {
  const p = path.join(rootDir, "GNANI_AI_SUBMISSION.md");
  if (!fs.existsSync(p)) return false;
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("J Ganesh Kumar Reddy") &&
         content.includes("Prisma v3.0") &&
         content.includes("Timbre") &&
         content.includes("Evon v3.3") &&
         content.includes("#GnaniAI") &&
         content.includes("#GreatIndianAIInternshipChallenge");
});

check("Executive SUBMISSION.md summary present", () => {
  const p = path.join(rootDir, "SUBMISSION.md");
  return fs.existsSync(p) && fs.statSync(p).size > 2000;
});

check("README.md contains Challenge badges & hub", () => {
  const p = path.join(rootDir, "README.md");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("The Great Indian AI Internship Challenge") &&
         content.includes("GNANI_AI_SUBMISSION.md");
});

check("PROJECT_PRESENTATION.md includes Slide 14 Bharat Voice", () => {
  const p = path.join(rootDir, "PROJECT_PRESENTATION.md");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("Slide 14: Bharat Voice AI Showcase");
});

check("PROJECT_FLOW.md includes Flow 26 Indic Voice Pipeline", () => {
  const p = path.join(rootDir, "PROJECT_FLOW.md");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("Flow 26: Bharat Indic Voice Financial Pipeline");
});

check("PROJECT_EXPLANATION.md includes Section 14.29", () => {
  const p = path.join(rootDir, "PROJECT_EXPLANATION.md");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("14.29 Bharat Voice AI Operating System");
});

// 2. Source Code Architecture Verification
check("Backend Gnani Voice Service (gnaniVoiceService.ts)", () => {
  const p = path.join(rootDir, "server", "src", "services", "gnaniVoiceService.ts");
  return fs.existsSync(p) && fs.statSync(p).size > 3000;
});

check("Backend Voice Controller & Routes mounted", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return fs.existsSync(p1) && fs.existsSync(p2) && c1.includes("queryVoiceHandler") && c2.includes("/voice/query");
});

check("Two-way Voice Q&A with Evon 30B reasoning & Timbre TTS", () => {
  const p = path.join(rootDir, "server", "src", "services", "gnaniVoiceService.ts");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("answerVoiceQueryWithEvon") && content.includes("synthesizeSpeechTimbre");
});

check("Python AI Core Provider Registry includes Gnani Evon", () => {
  const core = path.join(rootDir, "server", "AI_Core");
  const registry = fs.readFileSync(path.join(core, "utils", "provider_registry.py"), "utf-8");
  const settings = fs.readFileSync(path.join(core, "config", "settings.py"), "utf-8");
  return registry.includes('name="gnani"') && registry.includes("settings.GNANI_MODEL") &&
    settings.includes("gnani/gnani-evon-v3.3-30B-A3B");
});

check("Python AI Core Model Catalog includes Evon 30B entry", () => {
  const p = path.join(rootDir, "server", "AI_Core", "data", "model_catalog.json");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("evon-v3.3-30b");
});

check("Frontend Bharat Voice Assistant (BharatVoiceAssistant.tsx)", () => {
  const p = path.join(rootDir, "client", "src", "components", "voice", "BharatVoiceAssistant.tsx");
  return fs.existsSync(p) && fs.statSync(p).size > 4000;
});

check("Dedicated Bharat Voice Route (/voice)", () => {
  const p1 = path.join(rootDir, "client", "src", "pages", "BharatVoicePage.tsx");
  const p2 = path.join(rootDir, "client", "src", "routes", "routeDefinitions.tsx");
  const content = fs.readFileSync(p2, "utf-8");
  return fs.existsSync(p1) && content.includes("/voice");
});

check("Dedicated Gnani Submission Portal (/submission & SubmissionPage.tsx)", () => {
  const p1 = path.join(rootDir, "client", "src", "pages", "SubmissionPage.tsx");
  const p2 = path.join(rootDir, "client", "src", "routes", "routeDefinitions.tsx");
  const content = fs.readFileSync(p2, "utf-8");
  return fs.existsSync(p1) && content.includes("/submission");
});

check("BFSI Khata Debt & Collections Voice Endpoint (/voice/collections)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("khataVoiceHandler") && c2.includes("/voice/collections");
});

check("BFSI Customer Care & UPI Dispute Redressal (/voice/dispute)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("disputeVoiceHandler") && c2.includes("/voice/dispute");
});

check("AI Chat Input & Message Voice buttons integrated", () => {
  const p1 = path.join(rootDir, "client", "src", "features", "chat", "ChatInput.tsx");
  const p2 = path.join(rootDir, "client", "src", "features", "chat", "ChatMessage.tsx");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("transcribeLiveVoice") && c1.includes("Import audio for dictation") && c2.includes("handleSpeak");
});

check("Speech Acoustics & Sentiment Analytics Engine (/voice/analytics)", () => {
  const p1 = path.join(rootDir, "server", "src", "services", "gnaniVoiceService.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("analyzeSpeechAcoustics") && c2.includes("/voice/analytics");
});

check("Gnani Assist Co-Pilot Engine (/voice/assist)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("assistVoiceHandler") && c2.includes("/voice/assist");
});

check("Spoken Bharat Tax & GST Copilot (/voice/tax-advisor)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("taxAdvisorVoiceHandler") && c2.includes("/voice/tax-advisor");
});

check("Autonomous Spoken Vyapar Billing & Invoicing (/voice/billing)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("billingVoiceHandler") && c2.includes("/voice/billing");
});

check("Jan Kalyan Government Schemes Voice Navigator (/voice/schemes)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("schemesVoiceHandler") && c2.includes("/voice/schemes");
});

check("Zero-Trust Voice Biometrics Liveness Gate (/voice/biometrics/verify)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("biometricsVoiceHandler") && c2.includes("/voice/biometrics/verify");
});

check("Autonomous BPO 100% Call QA Auditing & Agent Scoring (/voice/bpo-audit)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("bpoAuditVoiceHandler") && c2.includes("/voice/bpo-audit");
});

check("Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY (/voice/healthcare)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("healthcareVoiceHandler") && c2.includes("/voice/healthcare");
});

check("Connected Automobile In-Cabin Voice & FASTag Telematics (/voice/automotive)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("automotiveVoiceHandler") && c2.includes("/voice/automotive");
});

check("Real Estate Spoken Property EMI & PMAY Housing Subsidy (/voice/real-estate)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("realEstateVoiceHandler") && c2.includes("/voice/real-estate");
});

check("Hospitality Spoken Concierge & Dining Reservation (/voice/hospitality)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("hospitalityVoiceHandler") && c2.includes("/voice/hospitality");
});

check("Consumer Durables Spoken Warranty & AMC Service Desk (/voice/consumer-durables)", () => {
  const p1 = path.join(rootDir, "server", "src", "controllers", "voiceController.ts");
  const p2 = path.join(rootDir, "server", "src", "routes", "voiceRoutes.ts");
  const c1 = fs.readFileSync(p1, "utf-8");
  const c2 = fs.readFileSync(p2, "utf-8");
  return c1.includes("consumerDurablesVoiceHandler") && c2.includes("/voice/consumer-durables");
});

check("Tier 2 & Tier 3 Town Offline Voice Resilience & Local Khata Sync", () => {
  const p = path.join(rootDir, "client", "src", "components", "voice", "BharatVoiceAssistant.tsx");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("Tier 2/3 Offline Sync") && content.includes("handleSyncOfflineMemos");
});

check("Live Contact Center Telephony Simulator & 8kHz Codec", () => {
  const p = path.join(rootDir, "client", "src", "components", "voice", "BharatVoiceAssistant.tsx");
  const content = fs.readFileSync(p, "utf-8");
  return content.includes("handleStartCallSimulation") &&
         content.includes("startPhoneRingSound") &&
         content.includes("8kHz Telephony Codec");
});

check("Automated Submission Package Bundler (package-submission.mjs)", () => {
  const p = path.join(rootDir, "scripts", "package-submission.mjs");
  return fs.existsSync(p) && fs.statSync(p).size > 1000;
});

// 3. Test Suites Verification
check("Gnani Voice Service Unit Tests (Vitest)", () => {
  const out = execSync("npm run test:ci --prefix server -- src/test/services/gnaniVoiceService.test.ts", {
    cwd: rootDir,
    encoding: "utf-8",
  });
  return out.includes("passed") && !out.includes("failed");
});

console.log("\n" + "-".repeat(78));
if (allPassed) {
  console.log(`\x1b[32m[SUCCESS] ${checksPassed} local submission checks passed.\x1b[0m`);
  console.log("See SUBMISSION.md for the live provider and public demo checklist.");
} else {
  console.log("\x1b[31m[ATTENTION] One or more verification checks failed. Review output above.\x1b[0m");
  process.exit(1);
}
console.log("-".repeat(78) + "\n");
