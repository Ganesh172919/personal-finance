/**
 * @fileoverview Global Keyboard Shortcuts Hook
 *
 * Registers application-wide keyboard shortcuts for power users.
 * Uses a single event listener on `window` to capture key combinations.
 *
 * DESIGN DECISIONS:
 * - `e.metaKey || e.ctrlKey` handles both macOS (Cmd) and Windows/Linux (Ctrl)
 * - Command bar toggle (Cmd+K) works even in input fields (standard UX convention)
 * - Navigation shortcuts are skipped when the user is typing in an input/textarea
 * - Escape always closes the command bar (universal close convention)
 *
 * WHY A HOOK INSTEAD OF A COMPONENT?
 * Keyboard shortcuts are behavior, not UI. A hook keeps the logic testable
 * and composable without requiring a wrapper component.
 *
 * @module hooks/useKeyboardShortcuts
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { useCommandBarStore } from "@/stores/commandBarStore";

/**
 * Global keyboard shortcuts for FinWise.
 *
 * Shortcuts:
 * - Ctrl/Cmd + K → Toggle AI command bar
 * - Ctrl/Cmd + / → Toggle AI command bar (alternative)
 * - Ctrl/Cmd + Shift + N → Navigate to new transaction (transactions page)
 * - Ctrl/Cmd + Shift + D → Navigate to dashboard
 * - Ctrl/Cmd + Shift + A → Navigate to analytics
 * - Ctrl/Cmd + Shift + T → Navigate to transactions
 * - Ctrl/Cmd + Shift + F → Navigate to finance OS
 * - Ctrl/Cmd + Shift + C → Navigate to chat
 * - Escape → Close command bar
 */
export function useKeyboardShortcuts() {
  const toggleCommandBar = useCommandBarStore((s) => s.toggle);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey; // Cross-platform modifier key

      // Detect if user is typing in an input field
      // Navigation shortcuts should not fire while typing
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl/Cmd + K → Toggle command bar (works even in inputs — industry standard)
      if (isCmd && e.key === "k") {
        e.preventDefault(); // Prevent browser's default "search bar" behavior
        toggleCommandBar();
        return;
      }

      // Ctrl/Cmd + / → Toggle command bar (alternative shortcut)
      if (isCmd && e.key === "/") {
        e.preventDefault();
        toggleCommandBar();
        return;
      }

      // Skip remaining shortcuts if user is in an input field
      if (isInput) return;

      // Ctrl/Cmd + Shift + <key> → Navigation shortcuts
      if (isCmd && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "d":
            e.preventDefault();
            navigate("/dashboard");
            break;
          case "a":
            e.preventDefault();
            navigate("/analytics");
            break;
          case "t":
            e.preventDefault();
            navigate("/transactions");
            break;
          case "n":
            e.preventDefault();
            navigate("/transactions"); // Navigate to transactions for new entry
            break;
          case "f":
            e.preventDefault();
            navigate("/finance");
            break;
          case "c":
            e.preventDefault();
            navigate("/chat");
            break;
        }
      }

      // Escape → Close command bar (universal close convention)
      if (e.key === "Escape") {
        // Use getState() to access store outside of React render cycle
        useCommandBarStore.getState().close();
      }
    };

    // Register on window (capture phase not needed — bubbling is sufficient)
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCommandBar, navigate]);
}
