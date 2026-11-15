import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const contains = (file, ...strings) => {
  const content = read(file);
  return strings.every((part) => content.includes(part));
};

const checks = [
  ["Official rules and form links", () => contains("SUBMISSION.md", "https://www.gnani.ai/internship", "https://forms.cloud.microsoft/r/dfFShbp7W7", "6:00 p.m. IST")],
  ["Timed public demo and judge walkthrough", () => contains("DEMO_PRESENTATION.txt", "60-SECOND PUBLIC DEMO", "THREE-MINUTE JUDGE WALKTHROUGH", "#GnaniAI", "#GreatIndianAIInternshipChallenge")],
  ["Operations guide and browser verification", () => contains("FINWISE_OPERATIONS.md", "npm run dev", "conversation_mode") && contains("SUBMISSION_QA.md", "built-in browser")],
  ["Submission page opens both product interfaces", () => contains("client/src/pages/SubmissionPage.tsx", 'href="/voice"', 'href="/chat"', "GNANI_SUBMISSION_FORM")],
  ["Removed submission badges and tools", () => {
    const product = read("client/src/pages/SubmissionPage.tsx") + read("client/src/routes/AppRouter.tsx");
    return !/Credits Active|Dossier|Teleprompter|Submission Hub|J Ganesh Kumar Reddy/.test(product);
  }],
  ["Gnani speech routes", () => contains("server/src/routes/voiceRoutes.ts", "/voice/transcribe", "/voice/synthesize", "/voice/query", "/voice/live-ticket", "/voice/expense-preview")],
  ["Evon model and browser availability status", () => contains("server/AI_Core/data/model_catalog.json", "evon-v3.3-30b") && contains("client/src/components/voice/BharatVoiceAssistant.tsx", "Evon v3.3 30B", "Separate endpoint required")],
  ["Conversational gateway compatibility", () => contains("server/src/services/aiCoreClient.ts", "isConversationalResponseUsable", "response.conversation_mode === true") && contains("server/AI_Core/contracts/responses.py", "conversation_mode")],
  ["Sensitive and Codex build files are ignored", () => contains(".gitignore", ".env", "*.pem", "*.key", ".codex-build/", "codex-build/", ".tmp/")],
];

let failed = false;
for (const [label, run] of checks) {
  try {
    if (!run()) throw new Error("Expected submission content is missing");
    console.log(`PASS  ${label}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL  ${label} (${error.message})`);
  }
}

if (failed) process.exit(1);
execSync("npm run test:voice", { cwd: fileURLToPath(root), stdio: "inherit" });
console.log(`${checks.length} local submission checks passed. See SUBMISSION_QA.md for live coverage.`);
