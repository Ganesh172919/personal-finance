/**
 * @fileoverview Virtual Scrolling Hook
 *
 * Implements virtualized list rendering for performance with large datasets.
 * Instead of rendering all items (e.g., 10,000 transactions), it only renders
 * items visible in the viewport plus a small buffer (overscan).
 *
 * HOW VIRTUAL SCROLLING WORKS:
 * 1. Container has a fixed height with `overflow-y: auto`
 * 2. A spacer element sets the total scrollable height (items.length * itemHeight)
 * 3. Only visible items (based on scroll position) are rendered in the DOM
 * 4. As the user scrolls, items enter/leave the visible window
 *
 * PERFORMANCE IMPACT:
 * - Without virtualization: 10,000 items = 10,000 DOM nodes
 * - With virtualization: 10,000 items with 10 visible = ~20 DOM nodes (10 + overscan)
 * - This dramatically reduces memory usage and improves scroll performance
 *
 * TRADEOFFS:
 * - Requires fixed item height (no dynamic/auto heights)
 * - Scroll position is tracked via ref (not state) to avoid re-renders on scroll
 * - The `forceUpdateRef` counter triggers re-renders when scroll changes
 *
 * @example
 * const { visibleItems, containerRef, totalHeight } = useVirtualList({
 *   items: allTransactions,
 *   itemHeight: 56,
 *   overscan: 5,
 * });
 *
 * return (
 *   <div ref={containerRef} style={{ height: 400, overflow: "auto" }}>
 *     <div style={{ height: totalHeight, position: "relative" }}>
 *       {visibleItems.map(({ item, index, offsetTop }) => (
 *         <div key={index} style={{ position: "absolute", top: offsetTop }}>
 *           {item.description}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 */

import { useRef, useEffect, useCallback, useState } from "react";

/**
 * Virtual scrolling hook for long lists.
 *
 * Renders only visible items plus a buffer, reducing DOM nodes
 * for transaction lists, activity feeds, and notification lists.
 */

// Defines configuration options for calculating virtualized window bounds.
// Encapsulates dataset items, uniform pixel row heights, overscan buffers, and height overrides.
// Controls the virtual viewport calculation parameters for performant list rendering.
interface UseVirtualListOptions<T> {
  items: T[];
  /** Fixed height per item in pixels */
  itemHeight: number;
  /** Extra items to render above/below viewport */
  overscan?: number;
  /** Container height override; defaults to measuring the container */
  containerHeight?: number;
}

// Represents an individual item positioned inside the virtualized viewport window.
// Packages the source data item, original array index, and vertical offset coordinates.
// Dictates absolute positioning styles within the virtual scrolling spacer container.
interface VirtualItem<T> {
  item: T;
  index: number;
  offsetTop: number;
}

// Encapsulates the virtual list calculation results and container ref bindings.
// Delivers the sliced visible items array, total spacer height, and refresh callbacks.
// Supplies all necessary rendering properties to mount virtual scrollable lists.
interface UseVirtualListResult<T> {
  /** Items currently visible + overscan buffer */
  visibleItems: VirtualItem<T>[];
  /** Total height of the virtual list (for scroll spacer) */
  totalHeight: number;
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Call to force re-measure */
  refresh: () => void;
}

// Custom React hook calculating visible item slices for large scrollable datasets.
// Observes scroll offsets and container height changes with passive event listeners.
// Reduces DOM element counts by rendering only visible items plus an overscan buffer.
export function useVirtualList<T>({
  items,
  itemHeight,
  overscan = 5,
  containerHeight: fixedHeight,
}: UseVirtualListOptions<T>): UseVirtualListResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(fixedHeight || 400);

  // Measure container height
  useEffect(() => {
    if (fixedHeight) {
      setViewportHeight(fixedHeight);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight);

    return () => observer.disconnect();
  }, [fixedHeight]);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const totalHeight = items.length * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
  );

  const visibleItems: VirtualItem<T>[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    visibleItems.push({
      item: items[i],
      index: i,
      offsetTop: i * itemHeight,
    });
  }

  const refresh = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
      setViewportHeight(fixedHeight || el.clientHeight);
    }
  }, [fixedHeight]);

  return {
    visibleItems,
    totalHeight,
    containerRef,
    refresh,
  };
}
