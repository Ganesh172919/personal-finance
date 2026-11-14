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

// Lazily instantiates and attaches a hidden live-region DOM node for screen reader output.
// Configures aria-live, aria-atomic, and off-screen screen-reader-only styling.
// Returns the persistent announcer element container shared across announcements.
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

// Broadcasts an audible status notification to assistive technologies and screen readers.
// Temporarily resets and populates the live region DOM node on the next animation frame.
// Supports polite queuing or assertive immediate interruption priority levels.
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

// Custom React hook detecting whether the operating system prefers reduced animations.
// Evaluates the 'prefers-reduced-motion: reduce' CSS media query condition.
// Returns a boolean flag allowing components to disable vestibular motion triggers.
export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  return mq.matches;
}

// ─── Focus Trap ─────────────────────────────────────────

// CSS selector query matching all interactive and keyboard-focusable DOM elements.
// Identifies links, enabled buttons, inputs, selects, textareas, and tabindex tags.
// Powers modal keyboard focus entrapment logic to prevent accessibility leaks.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Traps keyboard tab navigation strictly inside an active modal or drawer container.
// Cycles focus from the last interactive element back to the first and vice versa.
// Automatically restores focus to the previously active element upon unmounting.
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

// Accessible bypass navigation anchor allowing keyboard users to skip navigation bars.
// Remains visually hidden until focused via keyboard tab navigation at page load.
// Immediately moves keyboard focus directly to the primary main-content region.
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
