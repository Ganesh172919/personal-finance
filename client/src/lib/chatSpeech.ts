const voiceScripts = [
  [/\p{Script=Devanagari}/u, "hi-IN"], [/\p{Script=Telugu}/u, "te-IN"],
  [/\p{Script=Tamil}/u, "ta-IN"], [/\p{Script=Kannada}/u, "kn-IN"],
  [/\p{Script=Malayalam}/u, "ml-IN"], [/\p{Script=Bengali}/u, "bn-IN"],
  [/\p{Script=Gujarati}/u, "gu-IN"], [/\p{Script=Gurmukhi}/u, "pa-IN"],
] as const;

export function prepareChatSpeech(content: string, maxLength = 800, firstSentenceOnly = false) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, "")
    .replace(/^\s*\[[^\n\]]*\\[a-z]+[^\n\]]*\]\s*$/gim, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, "")
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, "")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const language = voiceScripts.find(([script]) => script.test(plainText))?.[1] ?? "en-IN";
  const cleanText = language === "en-IN"
    ? plainText.replace(/₹\s*(\d[\d,]*(?:\.\d+)?)/g, "$1 rupees").replace(/(\d)\s*%/g, "$1 percent")
      .replace(/\\times\b|×/g, " times ").replace(/=/g, " equals ")
    : plainText;
  const sentenceEnd = firstSentenceOnly ? /[.!?।](?=\s|$)/.exec(cleanText) : null;
  const excerpt = sentenceEnd ? cleanText.slice(0, sentenceEnd.index + 1) : cleanText;
  const firstPart = excerpt.slice(0, maxLength);
  const lastSentenceEnd = Math.max(firstPart.lastIndexOf(". "), firstPart.lastIndexOf("।"), firstPart.lastIndexOf("? "));
  const cappedText = excerpt.length <= maxLength ? firstPart : lastSentenceEnd >= maxLength / 2
    ? firstPart.slice(0, lastSentenceEnd + 1)
    : firstPart.replace(/\s+\S*$/, "").trim();
  return { cappedText, language };
}
