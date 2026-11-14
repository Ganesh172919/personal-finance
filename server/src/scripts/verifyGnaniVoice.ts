import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LiveGnaniVoiceProvider } from "../services/providers/liveGnaniVoiceProvider";
import { MockGnaniVoiceProvider } from "../services/providers/mockGnaniVoiceProvider";

const phrase = "मैंने चाय पर पचास रुपये खर्च किए।";
const outputDir = new URL("../../../dist/submission/demo/", import.meta.url);

async function verifyGnaniVoice() {
  if (!process.env.GNANI_API_KEY?.trim()) {
    throw new Error("Set GNANI_API_KEY in server/.env before running the live check.");
  }

  const provider = new LiveGnaniVoiceProvider();
  const speech = await provider.synthesizeSpeech(phrase, { language: "hi-IN" });
  if (speech.provider !== "gnani_timbre_live" || !speech.audioBuffer?.length) {
    throw new Error("Timbre did not return live audio. Check the Voice API key, quota, and endpoint.");
  }

  const recognition = await provider.transcribeAudio(speech.audioBuffer, {
    mimeType: "audio/wav",
    language: "hi-IN",
    codeMixed: false,
  });
  if (recognition.provider !== "gnani_prisma_v3_live" || !/\p{L}/u.test(recognition.transcript)) {
    throw new Error("Prisma did not return a live transcript with readable text.");
  }
  if (new MockGnaniVoiceProvider().extractIndicAmount(recognition.transcript) !== 50) {
    throw new Error(`FinWise could not extract ₹50 from the live Prisma transcript: ${recognition.transcript}`);
  }

  const audioFile = new URL("live-gnani-check.wav", outputDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(audioFile, speech.audioBuffer);
  console.log(`Timbre: ${speech.audioBuffer.length} bytes of live WAV audio`);
  console.log(`Prisma: ${recognition.transcript}`);
  console.log(`Compare with: ${phrase}`);
  console.log(`Audio: ${fileURLToPath(audioFile)}`);
}

verifyGnaniVoice().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live Gnani verification failed.");
  process.exitCode = 1;
});
