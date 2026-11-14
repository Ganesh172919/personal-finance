export const GNANI_SUBMISSION_DEADLINE = "2026-11-15T18:00:00+05:30";
export const GNANI_SUBMISSION_DEADLINE_LABEL = "November 15, 2026 at 6:00 p.m. IST";
export const GNANI_SUBMISSION_FORM = "https://forms.cloud.microsoft/r/dfFShbp7W7";
export const FINWISE_REPOSITORY = "https://github.com/Ganesh172919/personal-finance";

export const GNANI_AWARD_CATEGORIES = [
  { id: "regional", name: "Main Character Award", desc: "Build in a regional or low-resource Indian language." },
  { id: "hinglish", name: "Mixed Vibes Award", desc: "Build a voice experience for code-mixed speech." },
  { id: "impact", name: "Real Deal Award", desc: "Address a practical problem for a real community." },
  { id: "telephonic", name: "Noise Canceller Award", desc: "Demonstrate performance on noisy telephonic audio." },
  { id: "duo", name: "Two-Person Army Award", desc: "For eligible two-person teams." },
  { id: "solo", name: "Solo Ninja Award", desc: "For eligible solo participants." },
  { id: "creativity", name: "Jugaad Genius Award", desc: "Show a creative use of Gnani AI models." },
  { id: "small-town", name: "Small Town, Big Build Award", desc: "For eligible entries from Tier 2 or Tier 3 towns." },
  { id: "demo", name: "Demo Day Drop Award", desc: "Share a working 60-second video demo." },
  { id: "crowd", name: "Crowd Favourite Award", desc: "Decided through public engagement on LinkedIn or X." },
].map(category => ({ ...category, reward: "₹50,000" }));

export function getSubmissionCountdown(now = Date.now()): string | null {
  const remaining = Math.ceil((Date.parse(GNANI_SUBMISSION_DEADLINE) - now) / 1000);
  if (remaining <= 0) return null;

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor(remaining / 3600) % 24;
  const minutes = Math.floor(remaining / 60) % 60;
  const seconds = remaining % 60;
  const clock = `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
