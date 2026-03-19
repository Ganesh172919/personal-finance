import { buildApiUrl } from "@/lib/apiBase";

export function createAiStreamRequest(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return fetch(buildApiUrl("/v1/ai/process/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
    signal,
  });
}
