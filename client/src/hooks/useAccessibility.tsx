import { useEffect } from "react";

/**
 * Accessibility utilities for FinWise.
 *
 * useA11yAnnouncer — screen reader announcements via ARIA live region
 * useReducedMotion — respects prefers-reduced-motion
 * useFocusTrap — traps focus inside a container (for modals/panels)
 */

// ─── Screen Reader Announcements ────────────────────────

let announceEl: HTMLElement | null = null;

function ensureAnnouncer(): HTMLElement {
  if (announceEl) return announceEl;

  announceEl = document.createElement("div");
  announceEl.setAttribute("role", "status");
  announceEl.setAttribute("aria-live", "polite");
  announceEl.setAttribute("aria-atomic", "true");
  announceEl.className = "sr-only"; // Tailwind screen-reader-only
  announceEl.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  document.body.appendChild(announceEl);
  return announceEl;
}

export function announce(message: string, priority: "polite" | "assertive" = "polite") {
  const el = ensureAnnouncer();
  el.setAttribute("aria-live", priority);
  // Clear and re-set to trigger announcement
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

// ─── Reduced Motion Detection ───────────────────────────

export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  return mq.matches;
}

// ─── Focus Trap ─────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus first focusable element
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableEls = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // Restore focus on unmount
      previouslyFocused?.focus();
    };
  }, [active, containerRef]);
}

// ─── Skip to Content Link ───────────────────────────────

export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none"
    >
      Skip to main content
    </a>
  );
}
