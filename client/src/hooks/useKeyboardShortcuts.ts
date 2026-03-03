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
 */
export function useKeyboardShortcuts() {
  const toggleCommandBar = useCommandBarStore((s) => s.toggle);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl/Cmd + K → Toggle command bar (always, even in inputs)
      if (isCmd && e.key === "k") {
        e.preventDefault();
        toggleCommandBar();
        return;
      }

      // Ctrl/Cmd + / → Toggle command bar (alternative)
      if (isCmd && e.key === "/") {
        e.preventDefault();
        toggleCommandBar();
        return;
      }

      // Skip remaining shortcuts if user is in an input
      if (isInput) return;

      // Ctrl/Cmd + Shift + navigation shortcuts
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

      // Escape → Close command bar
      if (e.key === "Escape") {
        useCommandBarStore.getState().close();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCommandBar, navigate]);
}
