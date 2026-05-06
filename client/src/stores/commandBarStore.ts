/**
 * @fileoverview Command Bar State Store (Zustand)
 *
 * Manages the global command bar (Cmd+K palette) state. The command bar
 * provides quick access to navigation, actions, and AI commands.
 *
 * WHY A STORE?
 * The command bar toggle is triggered by keyboard shortcuts (useKeyboardShortcuts)
 * but rendered by the AiCommandBar component deep in the tree. A Zustand store
 * avoids prop-drilling the open/close state through multiple component layers.
 *
 * HISTORY:
 * Stores the last 20 queries for quick re-access. History is deduplicated
 * (moving the most recent occurrence to the top) and persisted only in memory.
 *
 * @example
 * // In a keyboard shortcut handler:
 * useCommandBarStore.getState().toggle();
 *
 * // In the command bar component:
 * const isOpen = useCommandBarStore((s) => s.isOpen);
 *
 * @module stores/commandBarStore
 */

import { create } from "zustand";

/** Command bar store state and actions */
interface CommandBarStore {
  /** Whether the command bar palette is open */
  isOpen: boolean;
  /** Recent command history (max 20) */
  history: string[];

  open: () => void;
  close: () => void;
  toggle: () => void;
  pushHistory: (query: string) => void;
}

/**
 * Global command bar state.
 * Allows Cmd+K registration in useKeyboardShortcuts and consumption
 * in AiCommandBar without prop-drilling.
 */
export const useCommandBarStore = create<CommandBarStore>((set) => ({
  isOpen: false,
  history: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  // Add query to history: deduplicate (remove existing) and cap at 20 entries
  pushHistory: (query) =>
    set((s) => ({
      history: [query, ...s.history.filter((h) => h !== query)].slice(0, 20),
    })),
}));
