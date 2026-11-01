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

/** Clear the active org ID (used when org access is denied) */
export const clearActiveOrgId = () => setActiveOrgId(null);

