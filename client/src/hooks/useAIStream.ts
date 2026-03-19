import { useState, useCallback, useRef } from "react";
import { useAIStore, type WorkflowTraceEntry } from "@/stores/aiStore";
import { createAiStreamRequest } from "@/services/aiStream";

export type AIResponseChunk =
  | { phase: "routing"; request_id: string }
  | { phase: "trace"; entry: WorkflowTraceEntry }
  | { phase: "complete"; result: Record<string, unknown> }
  | { phase: "error"; message: string };

/**
 * useAIStream — processes AI requests via SSE streaming.
 *
 * Instead of blocking for 5–15s, this hook streams AI responses as SSE events.
 * Each phase update is pushed to the aiStore so AgentWorkflowVisualizer
 * can render live trace animations.
 *
 * Falls back to the regular non-streaming endpoint if SSE fails.
 */
export function useAIStream() {
  const [chunks, setChunks] = useState<AIResponseChunk[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const aiStore = useAIStore();

  const stream = useCallback(
    async (payload: Record<string, unknown>) => {
      setIsStreaming(true);
      setChunks([]);
      setResult(null);
      setError(null);
      aiStore.reset();
      aiStore.setPhase("routing");

      abortRef.current = new AbortController();

      try {
        const response = await createAiStreamRequest(payload, abortRef.current.signal);

        if (!response.ok) {
          throw new Error(`Stream request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              setIsStreaming(false);
              return;
            }

            try {
              const chunk = JSON.parse(data) as AIResponseChunk;
              setChunks((prev) => [...prev, chunk]);

              if (chunk.phase === "routing") {
                aiStore.setPhase("routing");
              } else if (chunk.phase === "trace") {
                aiStore.setPhase("analyzing");
                aiStore.pushTraceEntry(chunk.entry);
              } else if (chunk.phase === "complete") {
                aiStore.setPhase("complete");
                setResult(chunk.result);
              } else if (chunk.phase === "error") {
                aiStore.setError(chunk.message);
                setError(chunk.message);
              }
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "AI stream failed";
        aiStore.setError(message);
        setError(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [aiStore],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    aiStore.reset();
  }, [aiStore]);

  return { chunks, isStreaming, result, error, stream, abort };
}
