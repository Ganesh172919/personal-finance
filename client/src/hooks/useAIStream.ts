/**
 * @fileoverview AI Streaming Hook
 *
 * This hook processes AI requests via Server-Sent Events (SSE) streaming.
 * Instead of waiting 5-15 seconds for a complete AI response, it streams
 * phase updates in real-time, providing a responsive user experience.
 *
 * STREAMING PHASES:
 * 1. "routing" — Request is being routed to the appropriate AI agent
 * 2. "trace" — AI agent is processing (workflow trace entries)
 * 3. "complete" — AI response is ready
 * 4. "error" — An error occurred during processing
 *
 * WHY STREAMING?
 * AI requests can take 5-15 seconds. Without streaming, the user sees a
 * blank screen with no feedback. Streaming provides:
 * - Immediate feedback that the request is being processed
 * - Live workflow visualization (which agent is working)
 * - Progressive result display
 *
 * RELATIONSHIP WITH aiStore:
 * Each phase update is pushed to the aiStore (Zustand), which drives the
 * AgentWorkflowVisualizer component to render live trace animations.
 *
 * @module hooks/useAIStream
 */

import { useState, useCallback, useRef } from "react";
import { useAIStore, type WorkflowTraceEntry } from "@/stores/aiStore";
import { createAiStreamRequest } from "@/services/aiStream";

/** Discriminated union of all possible SSE chunk types */
export type AIResponseChunk =
  | { phase: "routing"; request_id: string }           // Request being routed
  | { phase: "trace"; entry: WorkflowTraceEntry }      // Workflow trace entry
  | { phase: "complete"; result: Record<string, unknown> } // Final result
  | { phase: "error"; message: string };               // Error occurred

/**
 * Hook for streaming AI responses via SSE.
 *
 * Returns:
 * - chunks: All received SSE chunks
 * - isStreaming: Whether a stream is currently active
 * - result: The final AI result (null until complete)
 * - error: Error message (null if no error)
 * - stream: Function to start streaming
 * - abort: Function to cancel the stream
 *
 * @example
 * const { stream, isStreaming, result, error } = useAIStream();
 *
 * // Start streaming
 * await stream({ command: "analyze my spending" });
 *
 * // Cancel stream
 * abort();
 */
export function useAIStream() {
  const [chunks, setChunks] = useState<AIResponseChunk[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Access the AI store for workflow visualization
  const aiStore = useAIStore();

  /**
   * Starts streaming an AI request.
   *
   * FLOW:
   * 1. Reset state and set phase to "routing"
   * 2. Create an AbortController for cancellation
   * 3. Send the request to the streaming endpoint
   * 4. Read the response body as a stream
   * 5. Parse SSE chunks and update state
   * 6. Handle completion or errors
   *
   * @param payload - The AI request payload (command, context, etc.)
   */
  const stream = useCallback(
    async (payload: Record<string, unknown>) => {
      // Reset state
      setIsStreaming(true);
      setChunks([]);
      setResult(null);
      setError(null);
      aiStore.reset();
      aiStore.setPhase("routing");

      // Create abort controller for cancellation
      abortRef.current = new AbortController();

      try {
        // Send streaming request to AI endpoint
        const response = await createAiStreamRequest(payload, abortRef.current.signal);

        if (!response.ok) {
          throw new Error(`Stream request failed: ${response.status}`);
        }

        // Get a ReadableStream reader for the response body
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = ""; // Buffer for incomplete SSE lines

        // Read the stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode bytes and split into lines
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          // Process each complete line
          for (const line of lines) {
            // SSE format: "data: {...}\n\n"
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            // "[DONE]" signals end of stream
            if (data === "[DONE]") {
              setIsStreaming(false);
              return;
            }

            try {
              // Parse the JSON chunk
              const chunk = JSON.parse(data) as AIResponseChunk;
              setChunks((prev) => [...prev, chunk]);

              // Update AI store based on phase
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
              // Skip malformed SSE chunks (non-JSON data)
            }
          }
        }
      } catch (err: unknown) {
        // Ignore abort errors (user cancelled)
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

  /**
   * Aborts the current stream.
   * Resets streaming state and AI store.
   */
  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    aiStore.reset();
  }, [aiStore]);

  return { chunks, isStreaming, result, error, stream, abort };
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **ReadableStream API**: The hook uses the browser's ReadableStream API
 *    to process streaming responses. This is the modern way to handle
 *    streaming HTTP responses in the browser.
 *
 * 2. **SSE Parsing**: SSE has a simple format: "data: {...}\n\n".
 *    The hook handles buffering for incomplete lines and the "[DONE]" sentinel.
 *
 * 3. **AbortController**: Allows the user to cancel a long-running AI request.
 *    This is important for UX — users shouldn't have to wait if they change their mind.
 *
 * 4. **Store Integration**: Phase updates are pushed to aiStore, which drives
 *    the workflow visualization. This decouples the streaming logic from the UI.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * useAIStream → used by AiCommandBar and FinancialCopilot components
 * useAIStream → calls aiStream.ts for the HTTP request
 * useAIStream → updates aiStore for workflow visualization
 * useAIStream → displays results in the chat or command bar
 * ══════════════════════════════════════════════════════════════════════
 */
