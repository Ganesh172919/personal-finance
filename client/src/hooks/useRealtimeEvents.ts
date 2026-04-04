import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "./useAuth";

type SSEMessage = {
  type: string;
  aggregate_type?: string;
  payload?: Record<string, unknown>;
};

const EVENT_INVALIDATION_MAP: Record<string, string[][]> = {
  TransactionCreated: [
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/portfolio/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
    ["activity-feed"],
  ],
  TransactionUpdated: [
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/portfolio/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
    ["activity-feed"],
  ],
  TransactionDeleted: [
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/portfolio/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
    ["activity-feed"],
  ],
  GoalUpdated: [
    ["/api/financial-profiles/me"],
    ["/api/dashboard/summary"],
    ["goals"],
    ["activity-feed"],
  ],
  BudgetAllocationUpdated: [
    ["budget-envelopes"],
    ["/api/dashboard/summary"],
    ["analytics"],
    ["activity-feed"],
  ],
  WorkflowRunCompleted: [["workflow-runs"], ["tasks"], ["/api/tasks"], ["activity-feed"]],
  ReceiptProcessed: [
    ["/api/receipts"],
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
    ["activity-feed"],
  ],
  InsightGenerated: [
    ["insights"],
    ["/api/agent-outputs/user"],
    ["/api/agent-outputs/recent"],
    ["/api/ai-core/ai/status"],
    ["/api/ai-core/ai/sessions"],
    ["activity-feed"],
  ],
  TaskCreated: [["tasks"], ["/api/tasks"], ["activity-feed"]],
  TaskUpdated: [["tasks"], ["/api/tasks"], ["activity-feed"]],
  ExportCompleted: [["exports"], ["activity-feed"]],
  ScenarioEvaluated: [["analytics"], ["/api/dashboard/summary"], ["activity-feed"]],
};

const AGGREGATE_INVALIDATION_MAP: Record<string, string[][]> = {
  transaction: [
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/portfolio/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
  ],
  receipt: [
    ["/api/receipts"],
    ["/api/transactions"],
    ["/api/dashboard/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
  ],
  task: [["tasks"], ["/api/tasks"]],
  workflow: [["workflow-runs"], ["v1/workflows"], ["/api/tasks"]],
  scenario: [["analytics"], ["/api/dashboard/summary"]],
  insight: [["insights"], ["/api/agent-outputs/user"], ["/api/agent-outputs/recent"], ["/api/ai-core/ai/status"], ["/api/ai-core/ai/sessions"]],
  profile: [["/api/financial-profiles/me"], ["/api/dashboard/summary"], ["analytics"]],
  goal: [["/api/financial-profiles/me"], ["/api/dashboard/summary"], ["goals"]],
};

const buildInvalidationKeys = (event: SSEMessage) => {
  const seen = new Set<string>();
  const keys: string[][] = [];

  const pushKeys = (candidateKeys: string[][] | undefined) => {
    (candidateKeys || []).forEach((key) => {
      const signature = key.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      keys.push(key);
    });
  };

  pushKeys(EVENT_INVALIDATION_MAP[event.type]);
  pushKeys(AGGREGATE_INVALIDATION_MAP[String(event.aggregate_type || "").toLowerCase()]);

  if (event.payload && Object.prototype.hasOwnProperty.call(event.payload, "orgId")) {
    pushKeys([["/api/config/me"]]);
  }

  if (keys.length === 0) {
    pushKeys([["activity-feed"]]);
  }

  return keys;
};

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
          const evt = JSON.parse(e.data) as SSEMessage;
          const keys = buildInvalidationKeys(evt);
          keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        } catch {
          // Ignore malformed SSE payloads.
        }
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
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
