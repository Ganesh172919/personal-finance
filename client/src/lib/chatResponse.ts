/** Keep direct answers readable while retaining the server's full planning output. */
export function splitAnswerAndPlan(content: string): { answer: string; plan?: string } {
  const boundary = content.search(/\r?\nFINANCIAL PLAN\r?\n={10,}/);
  if (boundary < 0 || !content.slice(0, boundary).trim()) return { answer: content };
  return { answer: content.slice(0, boundary).trim(), plan: content.slice(boundary).trim() };
}
