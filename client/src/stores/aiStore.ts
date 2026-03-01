import { create } from "zustand";

export type AIPhase =
  | "idle"
  | "routing"
  | "analyzing"
  | "synthesizing"
  | "complete"
  | "error";

export type WorkflowTraceEntry = {
  agent: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  error?: string;
};

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

  setPhase: (phase) => set({ phase, errorMessage: phase === "error" ? undefined : null }),
  setError: (message) => set({ phase: "error", errorMessage: message }),
  pushTraceEntry: (entry) =>
    set((s) => ({
      traceEntries: [...s.traceEntries, entry],
      activeAgent: entry.agent,
    })),
  reset: () =>
    set({ phase: "idle", activeAgent: null, traceEntries: [], errorMessage: null }),
}));
