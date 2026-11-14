// Models a simplified chat message record used for conversation summarization.
// Distinguishes between conversational turns issued by user and assistant roles.
// Contains normalized message text content for deterministic summary extraction.
export type ChatSummaryMessage = { role: "user" | "assistant"; content: string };

// Collapses consecutive whitespace characters and newline breaks into single spaces.
// Strips extraneous leading and trailing whitespace from arbitrary string inputs.
// Prepares raw conversation text snippets for compact, consistent log rendering.
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

// Truncates text strings cleanly to a specified maximum character length constraint.
// Appends ellipsis indicators when input strings exceed the allowable threshold.
// Preserves complete strings intact when their length is within bounds.
const snippet = (value: string, maxLen: number) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3))}...`;
};

// Generates a concise deterministic summary of recent multi-turn chat messages.
// Extracts excerpts from previous user prompts, latest user query, and assistant response.
// Bounds overall output length to fit within upstream AI Core context payload budgets.
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
