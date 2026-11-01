import type { EvidenceItem } from "@/types/evidence.types";

export const isWorkspaceFileId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

export const readSourcePage = (value: string | null) => {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

export const readChatReturnPath = (value: string | null | undefined) =>
  typeof value === "string" && /^\/chat\/[a-f\d]{24}$/i.test(value) ? value : null;

export const evidenceFilePath = (item: EvidenceItem, returnTo?: string | null) => {
  if (!["file", "retrieval_chunk"].includes(item.type || "") || !isWorkspaceFileId(item.entity_id)) return null;
  const query = new URLSearchParams({ file: item.entity_id });
  if (Number.isSafeInteger(item.page_number) && item.page_number! > 0) query.set("page", String(item.page_number));
  const chatPath = readChatReturnPath(returnTo);
  if (chatPath) query.set("returnTo", chatPath);
  return `/files?${query}`;
};
