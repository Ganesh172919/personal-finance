/**
 * @fileoverview Real-time Events Hook (Server-Sent Events)
 *
 * This hook establishes a Server-Sent Events (SSE) connection to receive
 * real-time updates from the server. When domain events occur (e.g., a
 * transaction is created), the server pushes events to the client, and
 * this hook automatically invalidates the relevant React Query caches.
 *
 * HOW SSE WORKS:
 * 1. Client opens a persistent HTTP connection to /api/v1/events/stream
 * 2. Server sends events as "data: {...}\n\n" lines
 * 3. Client parses events and invalidates affected queries
 * 4. Invalidated queries automatically refetch fresh data
 *
 * EVENT-TO-QUERY MAPPING:
 * Each event type maps to a list of query keys that should be invalidated.
 * For example, "TransactionCreated" invalidates transaction lists, dashboards,
 * analytics, and activity feed queries.
 *
 * RECONNECTION:
 * If the SSE connection drops, the hook automatically reconnects after 5 seconds.
 * This handles network interruptions and server restarts.
 *
 * WHY SSE OVER WEBSOCKETS?
 * - SSE is simpler (one-directional: server → client)
 * - Works over standard HTTP (no upgrade needed)
 * - Built-in reconnection in browsers (though we handle it manually for more control)
 * - Perfect for event notification use cases
 *
 * @module hooks/useRealtimeEvents
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "./useAuth";

/** Shape of an SSE message from the server */
type SSEMessage = {
  type: string;                          // Event type (e.g., "TransactionCreated")
  aggregate_type?: string;               // Aggregate type (e.g., "transaction")
  payload?: Record<string, unknown>;     // Event payload data
};

/**
 * Maps specific event types to query keys that should be invalidated.
 *
 * Each entry maps an event type to an array of query key arrays.
 * When the event fires, all matching queries are refetched.
 */
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

/**
 * Maps aggregate types to query keys that should be invalidated.
 * This provides broader invalidation when specific event type mapping isn't available.
 */
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

/**
 * Builds the list of query keys to invalidate for a given SSE event.
 *
 * Uses both event type and aggregate type mappings, deduplicating keys.
 * Falls back to invalidating the activity feed if no specific mapping exists.
 *
 * @param event - The SSE event message
 * @returns Array of query keys to invalidate
 */
const buildInvalidationKeys = (event: SSEMessage) => {
  const seen = new Set<string>();
  const keys: string[][] = [];

  // Add keys, deduplicating by join signature
  const pushKeys = (candidateKeys: string[][] | undefined) => {
    (candidateKeys || []).forEach((key) => {
      const signature = key.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      keys.push(key);
    });
  };

  // Look up by specific event type
  pushKeys(EVENT_INVALIDATION_MAP[event.type]);
  // Look up by aggregate type (broader)
  pushKeys(AGGREGATE_INVALIDATION_MAP[String(event.aggregate_type || "").toLowerCase()]);

  // If event has orgId in payload, also invalidate config
  if (event.payload && Object.prototype.hasOwnProperty.call(event.payload, "orgId")) {
    pushKeys([["/api/config/me"]]);
  }

  // Fallback: always invalidate activity feed
  if (keys.length === 0) {
    pushKeys([["activity-feed"]]);
  }

  return keys;
};

/**
 * Hook that establishes an SSE connection for real-time event handling.
 *
 * This hook:
 * 1. Connects to /api/v1/events/stream when user is authenticated
 * 2. Listens for domain_event messages
 * 3. Invalidates affected React Query caches
 * 4. Automatically reconnects on connection loss (5s delay)
 * 5. Cleans up on unmount
 */
export function useRealtimeEvents() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only connect when user is authenticated
    if (!user) return;

    let stopped = false; // Guard against reconnect after unmount

    const connect = () => {
      if (stopped) return;

      // Create SSE connection with credentials (for JWT cookie)
      const es = new EventSource("/api/v1/events/stream", {
        withCredentials: true,
      });

      esRef.current = es;

      // Listen for domain events
      es.addEventListener("domain_event", (e: MessageEvent) => {
        try {
          const evt = JSON.parse(e.data) as SSEMessage;
          // Invalidate all affected queries
          const keys = buildInvalidationKeys(evt);
          keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        } catch {
          // Ignore malformed SSE payloads
        }
      });

      // Handle connection errors (reconnect after 5 seconds)
      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!stopped) {
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    // Cleanup on unmount
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

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **SSE for Real-time**: Server-Sent Events provide efficient one-way
 *    communication from server to client. Perfect for event notifications.
 *
 * 2. **Cache Invalidation Strategy**: Instead of manually updating cached data,
 *    we invalidate affected queries and let React Query refetch fresh data.
 *    This is simpler and more reliable than manual cache updates.
 *
 * 3. **Event → Query Mapping**: The mapping tables define which queries need
 *    refreshing for each event type. This is the "reactive cache" pattern.
 *
 * 4. **Auto-Reconnection**: SSE connections can drop due to network issues.
 *    The 5-second reconnect delay balances responsiveness with server load.
 *
 * 5. **Deduplication**: The buildInvalidationKeys function prevents the same
 *    query from being invalidated multiple times for a single event.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * useRealtimeEvents → activated in AppProviders (runs for entire app)
 * useRealtimeEvents → receives events from /api/v1/events/stream
 * useRealtimeEvents → invalidates React Query caches
 * useRealtimeEvents → queries automatically refetch fresh data
 * ══════════════════════════════════════════════════════════════════════
 */
