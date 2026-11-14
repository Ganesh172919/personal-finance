/**
 * @fileoverview Active Organization Context (localStorage)
 *
 * Manages the active organization ID in localStorage. This is a low-level
 * utility used by the API client (core.ts) to inject the X-Org-Id header
 * on every request for multi-tenant data isolation.
 *
 * WHY localStorage INSTEAD OF ZUSTAND?
 * This module is used by the API client, which runs outside React.
 * localStorage provides synchronous access without requiring React context.
 * The orgStore.ts (Zustand) provides the React-friendly version.
 *
 * SSR SAFETY:
 * All functions check `typeof window === "undefined"` to avoid SSR crashes.
 *
 * @module lib/orgContext
 */

import { retireRequestContext } from "./requestContext";

/** localStorage key for the active organization ID */
const STORAGE_KEY = "finwise.active_org_id";
const CHANGE_EVENT = "finwise:active-org-changed";

// Subscribes listeners to active organization context mutations across tabs and components.
// Listens for custom same-tab DOM events as well as cross-tab window storage changes.
// Returns an unbind cleanup function to remove event listeners upon component unmount.
/** Notify mounted UI immediately when same-tab API organization context changes. */
export const subscribeActiveOrgId = (listener: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

// Reads the currently active tenant organization identifier stored in localStorage.
// Performs safe SSR guards and handles private browsing quota access restrictions.
// Returns a valid non-empty organization ID string or null when unselected.
/** Get the active org ID from localStorage (null if not set) */
export const getActiveOrgId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
};

// Persists the newly selected organization identifier into local browser storage.
// Evicts stale client request context caches and broadcasts change events across tabs.
// Ensures synchronous multi-tenant header propagation for subsequent HTTP requests.
/** Set the active org ID in localStorage (null to clear) */
export const setActiveOrgId = (orgId: string | null) => {
  if (typeof window === "undefined") return;
  try {
    const changed = getActiveOrgId() !== (orgId || null);
    if (!orgId) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, orgId);
    }
    if (changed) retireRequestContext();
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore storage failures (e.g., quota exceeded, private browsing)
  }
};

// Clears the active organization selection from browser storage and dispatches updates.
// Invoked when organization permissions are revoked or during user session logout.
// Reverts API requests to default non-scoped tenant behavior across client views.
/** Clear the active org ID (used when org access is denied) */
export const clearActiveOrgId = () => setActiveOrgId(null);

