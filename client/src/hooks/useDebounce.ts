/**
 * @fileoverview Debounce Hook
 *
 * Delays updating a value until a specified period of inactivity has passed.
 * Commonly used for search inputs, filter controls, and auto-save features
 * to avoid excessive API calls or re-renders on every keystroke.
 *
 * HOW DEBOUNCING WORKS:
 * 1. User types "h", "he", "hel", "hell", "hello" rapidly
 * 2. Each keystroke resets the timer
 * 3. Only after the user stops typing for `delay` ms does the value update
 * 4. Components using the debounced value only re-render once (with "hello")
 *
 * WHY NOT JUST USE setTimeout IN THE COMPONENT?
 * The hook encapsulates the cleanup logic (clearTimeout on unmount or value change),
 * preventing memory leaks and stale updates.
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState("");
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * // This effect only fires 300ms after the user stops typing
 * useEffect(() => {
 *   if (debouncedSearch) fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */

import { useEffect, useState } from 'react';

/**
 * Returns a debounced version of `value` that only updates after `delay` ms
 * of inactivity (no new value changes).
 *
 * @typeParam T - The type of the value being debounced
 * @param value - The value to debounce (changes on every keystroke, etc.)
 * @param delay - Debounce delay in milliseconds (e.g., 300 for search)
 * @returns The debounced value (updates only after the delay)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Schedule the update after `delay` ms
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup: cancel the timer if value changes before delay expires
    // This is the core of debouncing — each new value resets the clock
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]); // Re-run when value or delay changes

  return debouncedValue;
}
