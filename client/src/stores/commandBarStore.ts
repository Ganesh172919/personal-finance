import { create } from "zustand";

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
 * Allows Cmd+K registration in App.tsx and consumption anywhere
 * without prop-drilling or component-local state in the 28KB AiCommandBar.
 */
export const useCommandBarStore = create<CommandBarStore>((set) => ({
  isOpen: false,
  history: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  pushHistory: (query) =>
    set((s) => ({
      history: [query, ...s.history.filter((h) => h !== query)].slice(0, 20),
    })),
}));
