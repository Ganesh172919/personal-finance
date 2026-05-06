/**
 * @fileoverview Organization Context Store (Zustand with Persist)
 *
 * Stores the user's currently active organization ID. In a multi-tenant app,
 * users may belong to multiple organizations and need to switch between them.
 * This store persists the selection to localStorage so it survives page refreshes.
 *
 * MULTI-TENANCY FLOW:
 * 1. User logs in → fetches their orgs (useAppConfig or org API)
 * 2. User selects an org → setActiveOrg(orgId)
 * 3. API client reads activeOrgId and injects X-Org-Id header (see core.ts)
 * 4. Server scopes all data queries to that org
 *
 * WHY PERSIST?
 * Without persistence, users would need to re-select their org on every
 * page refresh. localStorage ensures a smooth experience across sessions.
 *
 * @module stores/orgStore
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Organization store state and actions */
interface OrgStore {
  /** Currently active organization ID */
  activeOrgId: string | null;
  /** Set the active org (persisted to localStorage) */
  setActiveOrg: (orgId: string | null) => void;
}

/**
 * Persisted org context store.
 * Survives page refreshes so users don't need to re-select their org.
 * The API client (core.ts) reads this to inject X-Org-Id on every request.
 */
export const useOrgStore = create<OrgStore>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrg: (orgId) => set({ activeOrgId: orgId }),
    }),
    { name: "finwise-org" }, // localStorage key
  ),
);
