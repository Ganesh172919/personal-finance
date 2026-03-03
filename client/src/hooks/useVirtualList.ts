import { useRef, useEffect, useCallback } from "react";

/**
 * Virtual scrolling hook for long lists.
 *
 * Renders only visible items plus a buffer, reducing DOM nodes
 * for transaction lists, activity feeds, and notification lists.
 *
 * Usage:
 *   const { visibleItems, containerProps, totalHeight } = useVirtualList({
 *     items: allTransactions,
 *     itemHeight: 56,
 *     overscan: 5,
 *   });
 */

interface UseVirtualListOptions<T> {
  items: T[];
  /** Fixed height per item in pixels */
  itemHeight: number;
  /** Extra items to render above/below viewport */
  overscan?: number;
  /** Container height override; defaults to measuring the container */
  containerHeight?: number;
}

interface VirtualItem<T> {
  item: T;
  index: number;
  offsetTop: number;
}

interface UseVirtualListResult<T> {
  /** Items currently visible + overscan buffer */
  visibleItems: VirtualItem<T>[];
  /** Total height of the virtual list (for scroll spacer) */
  totalHeight: number;
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Call to force re-measure */
  refresh: () => void;
}

export function useVirtualList<T>({
  items,
  itemHeight,
  overscan = 5,
  containerHeight: fixedHeight,
}: UseVirtualListOptions<T>): UseVirtualListResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const heightRef = useRef(fixedHeight || 400);
  const forceUpdateRef = useRef(0);

  // Measure container height
  useEffect(() => {
    if (fixedHeight) {
      heightRef.current = fixedHeight;
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        heightRef.current = entry.contentRect.height;
      }
    });
    observer.observe(el);
    heightRef.current = el.clientHeight;

    return () => observer.disconnect();
  }, [fixedHeight]);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      scrollTopRef.current = el.scrollTop;
      forceUpdateRef.current++;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const totalHeight = items.length * itemHeight;
  const scrollTop = scrollTopRef.current;
  const viewportHeight = heightRef.current;

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
    forceUpdateRef.current++;
  }, []);

  return {
    visibleItems,
    totalHeight,
    containerRef,
    refresh,
  };
}
