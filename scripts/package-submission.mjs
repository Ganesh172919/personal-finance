import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist", "submission");
const zipName = "gnani-ai-internship-submission-j-ganesh-kumar-reddy.zip";
const docs = ["SUBMISSION.md", "FINWISE_OPERATIONS.md", "DEMO_AND_POST.md", "DEMO_PRESENTATION.txt", "SUBMISSION_QA.md"];
const demoAssets = [
  "demo/finwise-bharat-voice-demo.mp4",
  "demo/finwise-bharat-voice-3min.mp4",
  "demo/live-gnani-check.wav",
  "demo/verified-budget.jpg",
  "demo/verified-chat.jpg",
  "demo/verified-live-chat.jpg",
].filter((file) => existsSync(path.join(output, file)));

mkdirSync(output, { recursive: true });
for (const file of docs) copyFileSync(path.join(root, file), path.join(output, file));

const manifest = {
  challenge: "The Great Indian AI Internship Challenge 2026",
  deadline: "2026-11-15T18:00:00+05:30",
  rules: "https://www.gnani.ai/internship",
  submissionForm: "https://forms.cloud.microsoft/r/dfFShbp7W7",
  project: "FinWise Bharat Voice",
  participant: "J Ganesh Kumar Reddy",
  repository: "https://github.com/Ganesh172919/personal-finance",
  providers: {
    "Gnani Prisma": "Live transcription verified with synthetic Hindi speech and imported browser dictation",
    "Gnani Timbre": "Live speech synthesis verified through provider calls and the browser",
    "Groq GPT-OSS 20B": "Live answers verified in Finance Chat, dashboard assistant, and Bharat Voice",
    "Gnani Evon v3.3 30B": "Optional reasoning integration with contract tests. Requires a separate inference deployment for live use",
  },
  files: [...docs, ...demoAssets],
};

writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const temporaryZip = path.join(output, `.finwise-${process.pid}.zip`);
const files = [...manifest.files, "manifest.json"];
try {
  const windows = process.platform === "win32";
  const archiveArgs = windows ? ["-a", "-cf", temporaryZip, ...files] : ["-q", temporaryZip, ...files];
  execFileSync(windows ? "tar.exe" : "zip", archiveArgs, { cwd: output, stdio: "inherit" });
  const zipPath = path.join(output, zipName);
  renameSync(temporaryZip, zipPath);
  console.log(`Created ${zipPath} (${statSync(zipPath).size} bytes)`);
} finally {
  rmSync(temporaryZip, { force: true });
}

if (!demoAssets.some((file) => file.endsWith(".mp4"))) {
  console.log("This archive contains the documentation. Add the recorded demo before submitting.");
}
