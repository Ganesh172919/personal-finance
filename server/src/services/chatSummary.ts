export type ChatSummaryMessage = { role: "user" | "assistant"; content: string };

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const snippet = (value: string, maxLen: number) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3))}...`;
};

export const buildDeterministicChatSummary = (messages: ChatSummaryMessage[], maxChars = 800) => {
  const userMessages = messages.filter(m => m.role === "user");
  const assistantMessages = messages.filter(m => m.role === "assistant");

  const lastUser = userMessages[userMessages.length - 1];
  const prevUser = userMessages[userMessages.length - 2];
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  const parts: string[] = [];
  if (prevUser?.content) {
    parts.push(`Earlier: "${snippet(prevUser.content, 140)}"`);
  }
  if (lastUser?.content) {
    parts.push(`Latest: "${snippet(lastUser.content, 160)}"`);
  }
  if (lastAssistant?.content) {
    parts.push(`Assistant response focused on: "${snippet(lastAssistant.content, 220)}"`);
  }

  const summary = parts.join(" | ");
  return summary.length <= maxChars ? summary : `${summary.slice(0, Math.max(0, maxChars - 3))}...`;
};
