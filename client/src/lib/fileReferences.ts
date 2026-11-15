import type { EvidenceItem } from "@/types/evidence.types";

// Type guard validating whether a value represents a valid 24-character hex Mongo ID.
// Checks string type and regular expression patterns for workspace file identification.
// Enforces type safety when passing file references between chat and storage systems.
export const isWorkspaceFileId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

// Parses and sanitizes pagination indices received from query strings or metadata.
// Converts numeric strings to positive integers while falling back to page one on errors.
// Protects PDF document viewer controls against invalid or non-numeric page requests.
export const readSourcePage = (value: string | null) => {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

// Validates that a return redirect route represents a legitimate chat session path.
// Matches expected chat URL patterns to prevent open-redirect vulnerabilities.
// Preserves navigation history so users can return seamlessly from file inspections.
export const readChatReturnPath = (value: string | null | undefined) =>
  typeof value === "string" && /^\/chat\/(?:(?:cloud|local)\/)?[a-f\d]{24}$/i.test(value) ? value : null;

// Constructs a deep-link URL pointing directly to a cited workspace evidence document.
// Attaches target file ID, specific page numbers, and chat return path parameters.
// Enables one-click navigation from conversational citations into the document viewer.
export const evidenceFilePath = (item: EvidenceItem, returnTo?: string | null) => {
  if (!["file", "retrieval_chunk"].includes(item.type || "") || !isWorkspaceFileId(item.entity_id)) return null;
  const query = new URLSearchParams({ file: item.entity_id });
  if (Number.isSafeInteger(item.page_number) && item.page_number! > 0) query.set("page", String(item.page_number));
  const chatPath = readChatReturnPath(returnTo);
  if (chatPath) query.set("returnTo", chatPath);
  return `/files?${query}`;
};
