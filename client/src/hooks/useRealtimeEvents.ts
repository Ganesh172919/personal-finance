import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

/**
 * Mapping from domain event types → React Query cache keys to invalidate.
 * When the server emits an SSE event of a given type, these query keys are
 * automatically invalidated so the UI refreshes in near real-time.
 */
const EVENT_INVALIDATION_MAP: Record<string, string[][]> = {
  TransactionCreated: [["transactions"], ["budget-envelopes"], ["financial-vitals"], ["forecast"]],
  TransactionUpdated: [["transactions"], ["budget-envelopes"], ["financial-vitals"]],
  TransactionDeleted: [["transactions"], ["budget-envelopes"], ["financial-vitals"]],
  GoalUpdated: [["goals"]],
  BudgetAllocationUpdated: [["budget-envelopes"]],
  WorkflowRunCompleted: [["workflow-runs"], ["tasks"]],
  ReceiptProcessed: [["receipts"], ["transactions"]],
  InsightGenerated: [["insights"]],
  TaskCreated: [["tasks"]],
  TaskUpdated: [["tasks"]],
  ExportCompleted: [["exports"]],
};

type SSEMessage = {
  type: string;
  payload?: unknown;
};

/**
 * useRealtimeEvents — SSE consumer hook.
 *
 * Opens a persistent EventSource to `/api/v1/events/stream`.
 * When domain events arrive, it invalidates the matching React Query
 * cache keys so the UI refreshes automatically (~500ms vs 10s polling).
 *
 * Mount once in App.tsx inside AuthProvider.
 */
export function useRealtimeEvents() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    let stopped = false;

    const connect = () => {
      if (stopped) return;

      const es = new EventSource("/api/v1/events/stream", {
        withCredentials: true,
      });

      esRef.current = es;

      es.addEventListener("domain_event", (e: MessageEvent) => {
        try {
          const evt: SSEMessage = JSON.parse(e.data);
          const keys = EVENT_INVALIDATION_MAP[evt.type] ?? [];
          keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        } catch {
          /* ignore malformed events */
        }
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Auto-reconnect after 5s
        if (!stopped) {
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [user, qc]);
}
