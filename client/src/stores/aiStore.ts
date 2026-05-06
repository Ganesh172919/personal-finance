/**
 * @fileoverview AI Processing State Store (Zustand)
 *
 * Tracks the real-time state of AI request processing, including the current
 * phase, active agent, and workflow trace entries. This store is updated by
 * the `useAIStream` hook as SSE chunks arrive from the server.
 *
 * PHASE LIFECYCLE:
 * idle → routing → analyzing → complete (happy path)
 * idle → routing → analyzing → error (failure path)
 *
 * RELATIONSHIP WITH useAIStream:
 * useAIStream receives SSE chunks and calls this store's actions to update
 * the phase and push trace entries. The AgentWorkflowVisualizer component
 * reads from this store to render live workflow animations.
 *
 * WHY ZUSTAND OVER useReducer?
 * Zustand allows non-React code (like SSE event handlers) to update state
 * via `getState()` / `setState()`, which is critical for the streaming hook.
 *
 * @module stores/aiStore
 */

import { create } from "zustand";

/**
 * AI processing phases — matches the SSE streaming phases.
 * "idle" = no active request, "synthesizing" = building final response.
 */
export type AIPhase =
  | "idle"
  | "routing"
  | "analyzing"
  | "synthesizing"
  | "complete"
  | "error";

/**
 * A single workflow trace entry — records one agent's execution.
 * Used to build the workflow visualization timeline.
 */
export type WorkflowTraceEntry = {
  agent: string;        // Agent name (e.g., "cashflow_analyst", "budget_planner")
  startedAt: string;    // ISO timestamp when agent started
  endedAt?: string;     // ISO timestamp when agent finished (undefined if still running)
  status: string;       // "running" | "completed" | "failed"
  error?: string;       // Error message if status is "failed"
};

/** AI store state and actions interface */
interface AIStore {
  /** Current AI processing phase */
  phase: AIPhase;
  /** Currently active agent name */
  activeAgent: string | null;
  /** Accumulated workflow trace entries during streaming */
  traceEntries: WorkflowTraceEntry[];
  /** Error message if phase is 'error' */
  errorMessage: string | null;

  setPhase: (phase: AIPhase) => void;
  setError: (message: string) => void;
  pushTraceEntry: (entry: WorkflowTraceEntry) => void;
  reset: () => void;
}

/**
 * Global AI state store.
 * Tracks the current processing phase and workflow trace entries
 * so AgentWorkflowVisualizer can animate traces live during streaming.
 */
export const useAIStore = create<AIStore>((set) => ({
  phase: "idle",
  activeAgent: null,
  traceEntries: [],
  errorMessage: null,

  // Update phase; clear error message when leaving error state
  setPhase: (phase) => set({ phase, errorMessage: phase === "error" ? undefined : null }),

  // Set error phase with a message
  setError: (message) => set({ phase: "error", errorMessage: message }),

  // Append a trace entry and update the active agent
  pushTraceEntry: (entry) =>
    set((s) => ({
      traceEntries: [...s.traceEntries, entry],
      activeAgent: entry.agent, // Track which agent is currently working
    })),

  // Reset all state to initial values (called on new request or abort)
  reset: () =>
    set({ phase: "idle", activeAgent: null, traceEntries: [], errorMessage: null }),
}));
