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

/** localStorage key for the active organization ID */
const STORAGE_KEY = "finwise.active_org_id";

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
    if (!orgId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // Ignore storage failures (e.g., quota exceeded, private browsing)
  }
};

/** Clear the active org ID (used when org access is denied) */
export const clearActiveOrgId = () => setActiveOrgId(null);

