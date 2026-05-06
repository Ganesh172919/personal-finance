/**
 * @fileoverview Responsive Mobile Detection Hook
 *
 * Detects whether the current viewport is below the mobile breakpoint (768px).
 * Uses `matchMedia` for efficient, event-driven detection instead of
 * listening to the `resize` event on every pixel change.
 *
 * WHY matchMedia OVER resize EVENT?
 * - `matchMedia` fires only when the breakpoint is crossed (not on every pixel)
 * - More performant for components that re-render on breakpoint changes
 * - Correctly handles orientation changes on mobile devices
 *
 * INITIAL STATE: `undefined`
 * The hook starts as `undefined` to avoid hydration mismatches in SSR.
 * Components should handle the `undefined` state (e.g., render nothing or a skeleton).
 *
 * @example
 * const isMobile = useIsMobile();
 * return isMobile ? <MobileNav /> : <DesktopNav />;
 *
 * @module hooks/use-mobile
 */

import * as React from "react";

/** Mobile breakpoint in pixels (matches Tailwind's `md` breakpoint) */
const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` if the viewport width is below 768px.
 * Updates reactively when the viewport crosses the breakpoint.
 */
export function useIsMobile() {
  // Start as undefined to prevent SSR hydration mismatches
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // Create a media query that matches below the breakpoint
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    // Listen for breakpoint crossings (not every resize)
    mediaQuery.addEventListener("change", onChange);
    // Set initial value
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  // Coerce undefined to false for simpler usage: !!undefined === false
  return !!isMobile;
}
